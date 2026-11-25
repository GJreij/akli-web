package org.aklilb.app;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.graphics.BitmapFactory;
import android.os.Build;
import androidx.annotation.NonNull;
import androidx.core.app.NotificationCompat;
import com.capacitorjs.plugins.pushnotifications.MessagingService;
import com.google.firebase.messaging.RemoteMessage;
import java.util.Map;

/**
 * Shows Akli notifications ourselves so they can carry the full-colour logo
 * (a large icon) instead of the single-colour circle Android draws for the
 * small icon on its own. Our server sends data-only messages (title, body,
 * path); anything else is handed to the standard push plugin untouched.
 */
public class AkliMessagingService extends MessagingService {

    private static final String CHANNEL_ID = "akli_default";

    @Override
    public void onMessageReceived(@NonNull RemoteMessage remoteMessage) {
        Map<String, String> data = remoteMessage.getData();
        String title = data.get("title");
        String body = data.get("body");
        if (remoteMessage.getNotification() != null || title == null || body == null) {
            super.onMessageReceived(remoteMessage);
            return;
        }
        show(title, body, data.get("path"));
    }

    private void show(String title, String body, String path) {
        NotificationManager manager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager == null) return;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && manager.getNotificationChannel(CHANNEL_ID) == null) {
            NotificationChannel channel = new NotificationChannel(CHANNEL_ID, "Akli", NotificationManager.IMPORTANCE_HIGH);
            manager.createNotificationChannel(channel);
        }

        // Tapping opens the app. The extras mirror what a standard push carries, so
        // the push plugin reports the tap (and its "path") to the web app.
        int id = (int) (System.currentTimeMillis() & 0x7fffffff);
        Intent open = new Intent(this, MainActivity.class);
        open.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        open.putExtra("google.message_id", "akli-" + id);
        if (path != null) open.putExtra("path", path);
        PendingIntent tap = PendingIntent.getActivity(this, id, open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);

        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_stat_akli)
            .setLargeIcon(BitmapFactory.decodeResource(getResources(), R.drawable.ic_large_akli))
            .setColor(getResources().getColor(R.color.akli_notification_color, getTheme()))
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setAutoCancel(true)
            .setContentIntent(tap);
        manager.notify(id, builder.build());
    }
}
