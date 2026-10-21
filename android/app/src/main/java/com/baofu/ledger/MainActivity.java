package com.baofu.ledger;

import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.os.Process;
import android.os.SystemClock;
import android.view.View;
import android.webkit.WebView;

import androidx.core.splashscreen.SplashScreen;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    // 与网页默认主题底色一致的米黄。键盘弹起 / 切换不同高度输入法时，
    // WebView 与键盘之间可能露出一条间隙；把窗口根视图和 WebView 自身的
    // 背景都钉成米黄，可确保露出的间隙不是刺眼的白色（“白图”）。
    private static final int BG = Color.parseColor("#FDF8E8");

    // 1019-U：启动画面最多留这么久（毫秒）。网页层首屏画出来就调 Launch.ready()，通常用不到这么久
    private static final long SPLASH_MAX_MS = 1000;

    // 1021-T28：启动画面淡出用多久（毫秒）
    private static final long SPLASH_FADE_MS = 200;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // 1019-U：启动画面等网页首屏画好再收（原来系统画出第一帧就收，那时网页还是一片底色），最多 1 秒。
        //   installSplashScreen 必须在 super.onCreate() 之前调；主题里 AppTheme.NoActionBarLaunch 本来就是 Theme.SplashScreen。
        // 1019-X：记下原生那段的时间点（给网页的性能记录）；去掉安卓 12 起启动画面自带的退场动画（收的时候直接拿掉）；
        //   开发开关「启动画面等首屏」关掉时（存在 SharedPreferences）整段不装，回到 1019-U 之前「系统画出第一帧就收」。
        LaunchPlugin.reset();
        final long t0 = SystemClock.uptimeMillis();
        LaunchPlugin.actCreate = t0;
        if (Build.VERSION.SDK_INT >= 24) {
            try { LaunchPlugin.procStart = Process.getStartUptimeMillis(); } catch (Exception ignored) {}
        }
        LaunchPlugin.waitOn = LaunchPlugin.readWait(this);
        if (LaunchPlugin.waitOn) {
            try {
                SplashScreen splash = SplashScreen.installSplashScreen(this);
                splash.setKeepOnScreenCondition(() -> !LaunchPlugin.isReady() && SystemClock.uptimeMillis() - t0 < SPLASH_MAX_MS);
                // 1021-T28：启动画面淡出（SPLASH_FADE_MS），不再一下消失；淡出时下面的首屏已经画好，边淡边露出来。
                //   性能记录里的「启动画面收起」记开始淡出的时刻；淡出出错就照原来直接拿掉
                splash.setOnExitAnimationListener(view -> {
                    LaunchPlugin.splashGone = SystemClock.uptimeMillis();
                    try {
                        view.getView().animate().alpha(0f).setDuration(SPLASH_FADE_MS)
                            .withEndAction(() -> { try { view.remove(); } catch (Exception ignored) {} })
                            .start();
                    } catch (Exception e) {
                        try { view.remove(); } catch (Exception ignored) {}
                    }
                });
            } catch (Exception ignored) {}
        }
        registerPlugin(LaunchPlugin.class);
        // 必须在 super.onCreate() 之前注册：让「云备份」设置里的 OneDrive 直连功能可用
        registerPlugin(OneDriveLinkPlugin.class);
        // 1016-Z3：「用记问打开」账单文件（csv / xlsx）
        registerPlugin(OpenFilePlugin.class);
        super.onCreate(savedInstanceState);
        LaunchPlugin.webReady = SystemClock.uptimeMillis();   // 1019-X：Capacitor 在 super.onCreate 里建好 WebView、开始加载网页

        // 1) 窗口根视图（decorView）背景：兜住一切层级最底下的露出
        try {
            View decor = getWindow().getDecorView();
            if (decor != null) decor.setBackgroundColor(BG);
            getWindow().setBackgroundDrawableResource(R.color.appWindowBackground);
        } catch (Exception ignored) {}

        // 2) WebView 自身及其父容器背景：兜住 WebView 被压缩后让出的区域
        try {
            WebView wv = getBridge() != null ? getBridge().getWebView() : null;
            if (wv != null) {
                wv.setBackgroundColor(BG);
                View parent = (View) wv.getParent();
                if (parent != null) parent.setBackgroundColor(BG);
            }
        } catch (Exception ignored) {}
    }
}
