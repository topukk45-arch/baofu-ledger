package com.baofu.ledger;

import android.graphics.Color;
import android.os.Bundle;
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

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // 1019-U：启动画面等网页首屏画好再收（原来系统画出第一帧就收，那时网页还是一片底色），最多 1 秒。
        //   installSplashScreen 必须在 super.onCreate() 之前调；主题里 AppTheme.NoActionBarLaunch 本来就是 Theme.SplashScreen。
        LaunchPlugin.reset();
        final long t0 = SystemClock.uptimeMillis();
        try {
            SplashScreen splash = SplashScreen.installSplashScreen(this);
            splash.setKeepOnScreenCondition(() -> !LaunchPlugin.isReady() && SystemClock.uptimeMillis() - t0 < SPLASH_MAX_MS);
        } catch (Exception ignored) {}
        registerPlugin(LaunchPlugin.class);
        // 必须在 super.onCreate() 之前注册：让「云备份」设置里的 OneDrive 直连功能可用
        registerPlugin(OneDriveLinkPlugin.class);
        // 1016-Z3：「用记问打开」账单文件（csv / xlsx）
        registerPlugin(OpenFilePlugin.class);
        super.onCreate(savedInstanceState);

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
