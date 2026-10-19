package com.baofu.ledger;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * 1019-U：启动画面等首屏画好再收。
 * 网页层首屏出来的那一帧（有首屏快照就是快照画出来时，没有就是真的首屏 / 登录页画好时）调 ready()，
 * MainActivity 里的启动画面看到 ready 了就收；网页一直没调（出错、老系统）也最多留 1 秒（MainActivity 里管）。
 */
@CapacitorPlugin(name = "Launch")
public class LaunchPlugin extends Plugin {

    private static volatile boolean ready = false;

    public static boolean isReady() { return ready; }

    // 每次 Activity 重新建（重新打开 App）都从「没好」开始
    public static void reset() { ready = false; }

    @PluginMethod
    public void ready(PluginCall call) {
        ready = true;
        call.resolve();
    }
}
