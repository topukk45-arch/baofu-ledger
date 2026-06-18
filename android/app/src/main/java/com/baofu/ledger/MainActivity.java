package com.baofu.ledger;

import android.graphics.Color;
import android.os.Bundle;
import android.view.View;
import android.webkit.WebView;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    // 与网页默认主题底色一致的米黄。键盘弹起 / 切换不同高度输入法时，
    // WebView 与键盘之间可能露出一条间隙；把窗口根视图和 WebView 自身的
    // 背景都钉成米黄，可确保露出的间隙不是刺眼的白色（“白图”）。
    private static final int BG = Color.parseColor("#FDF8E8");

    @Override
    public void onCreate(Bundle savedInstanceState) {
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
