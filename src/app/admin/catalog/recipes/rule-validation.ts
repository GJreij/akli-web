export type RuleType = "gt" | "gte" | "lt" | "lte" | "eq" | "fixed";

export type ExistingRule = {
  subrecipe_a_id: number;
  subrecipe_b_id: number | null;
  rule_type: string;
  ratio: number;
  fixed_servings: number | null;
};

export type NewRule = {
  subrecipe_a_id: number;
  subrecipe_b_id: number | null;
  rule_type: RuleType;
  ratio: number;
  fixed_servings: number | null;
};

/**
 * Checks whether `newRule` logically contradicts any rule already saved for
 * the recipe. Inequalities are normalised to directed edges between
 * equality-groups (eq rules union subrecipes into one group); a new rule is
 * rejected if it would create a directed cycle (A>=B and B>=A, transitively)
 * or conflicts with an existing fixed-servings value.
 */
export function validateRuleConsistency(
  existing: ExistingRule[],
  newRule: NewRule,
): { ok: true } | { ok: false; error: string } {
  // Union-find over subrecipe ids, merged by `eq` rules.
  const parent = new Map<number, number>();
  const find = (x: number): number => {
    if (!parent.has(x)) parent.set(x, x);
    let root = x;
    while (parent.get(root) !== root) root = parent.get(root)!;
    parent.set(x, root);
    return root;
  };
  const union = (a: number, b: number) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  };

  for (const r of existing) {
    if (r.rule_type === "eq" && r.subrecipe_b_id != null) {
      union(r.subrecipe_a_id, r.subrecipe_b_id);
    }
  }

  // Directed edges between group representatives, from gte/gt/lte/lt rules
  // (normalised so the edge always reads "from >= to", strict for gt/lt).
  const edges = new Map<number, Set<number>>();
  const addEdge = (from: number, to: number) => {
    if (!edges.has(from)) edges.set(from, new Set());
    edges.get(from)!.add(to);
  };
  const hasDirectEdge = (from: number, to: number) => edges.get(from)?.has(to) ?? false;

  const normalizeIneq = (r: { subrecipe_a_id: number; subrecipe_b_id: number | null; rule_type: string }) => {
    if (r.subrecipe_b_id == null) return null;
    const a = find(r.subrecipe_a_id);
    const b = find(r.subrecipe_b_id);
    if (r.rule_type === "gte" || r.rule_type === "gt") return { from: a, to: b };
    if (r.rule_type === "lte" || r.rule_type === "lt") return { from: b, to: a };
    return null;
  };

  for (const r of existing) {
    const n = normalizeIneq(r);
    if (n) addEdge(n.from, n.to);
  }

  // Reachability check (DFS) — does `start` reach `target` via existing edges?
  const reaches = (start: number, target: number): boolean => {
    const seen = new Set<number>();
    const stack = [start];
    while (stack.length) {
      const cur = stack.pop()!;
      if (cur === target) return true;
      if (seen.has(cur)) continue;
      seen.add(cur);
      for (const next of edges.get(cur) ?? []) stack.push(next);
    }
    return false;
  };

  // Fixed-servings map, keyed by group representative.
  const fixedByGroup = new Map<number, number>();
  for (const r of existing) {
    if (r.rule_type === "fixed" && r.fixed_servings != null) {
      fixedByGroup.set(find(r.subrecipe_a_id), r.fixed_servings);
    }
  }

  if (newRule.rule_type === "fixed") {
    const group = find(newRule.subrecipe_a_id);
    const existingFixed = fixedByGroup.get(group);
    if (existingFixed != null && existingFixed !== newRule.fixed_servings) {
      return { ok: false, error: "This subrecipe (or one equal to it) already has a different fixed serving count." };
    }
    return { ok: true };
  }

  if (newRule.subrecipe_b_id == null) {
    return { ok: false, error: "This rule type requires a second subrecipe." };
  }

  const groupA = find(newRule.subrecipe_a_id);
  const groupB = find(newRule.subrecipe_b_id);

  if (groupA === groupB) {
    return { ok: false, error: "These subrecipes are already linked by an equal rule — an inequality would contradict it." };
  }

  if (newRule.rule_type === "eq") {
    // eq directly contradicts any existing inequality between these two groups.
    if (hasDirectEdge(groupA, groupB) || hasDirectEdge(groupB, groupA)) {
      return { ok: false, error: "These subrecipes already have an inequality rule between them — can't also mark them equal." };
    }
    if (fixedByGroup.has(groupA) && fixedByGroup.has(groupB) && fixedByGroup.get(groupA) !== fixedByGroup.get(groupB)) {
      return { ok: false, error: "These subrecipes have different fixed serving counts — they can't be marked equal." };
    }
    // Tentatively merge and check for a cycle in the resulting graph.
    union(groupA, groupB);
    const remapped = new Map<number, Set<number>>();
    for (const [from, tos] of edges) {
      const f = find(from);
      if (!remapped.has(f)) remapped.set(f, new Set());
      for (const to of tos) remapped.get(f)!.add(find(to));
    }
    for (const [from, tos] of remapped) {
      if (tos.has(from)) {
        return { ok: false, error: "Marking these subrecipes equal would create a contradictory cycle with existing rules." };
      }
    }
    return { ok: true };
  }

  // gt / gte / lt / lte
  const n = normalizeIneq(newRule);
  if (!n) return { ok: false, error: "Unrecognized rule type." };

  if (hasDirectEdge(n.from, n.to)) {
    return { ok: false, error: "This exact rule already exists — edit or remove it instead of adding a duplicate." };
  }

  if (reaches(n.to, n.from)) {
    return { ok: false, error: "This rule contradicts an existing rule (directly or transitively) between these subrecipes." };
  }

  return { ok: true };
}
