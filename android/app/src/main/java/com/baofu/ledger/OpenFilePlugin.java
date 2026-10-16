package com.baofu.ledger;

import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.provider.OpenableColumns;
import android.util.Base64;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;

/**
 * 1016-Z3「用记问打开」：在文件管理、微信里对账单文件（csv / xlsx）选「用其他应用打开」或「分享」到记问时，
 * 系统把文件以 content:// 交给 MainActivity（AndroidManifest 里的 VIEW / SEND 过滤器）。
 * 这里把文件读成字节（不超过 8MB，和导入的上限一样），存成「待取的文件」，网页层来取：
 *   getPending() -> { file: { name, data(base64), size } | { name, error } }，取一次就清掉；
 *   新来一个文件时发 "fileOpened" 事件（不带内容），网页层收到后再调 getPending() 取。
 * 只读这一个文件，不保存、不改它。导入功能开没开（开发开关）由网页层判断。
 */
@CapacitorPlugin(name = "OpenFile")
public class OpenFilePlugin extends Plugin {

    private static final int MAX_BYTES = 8 * 1024 * 1024;
    private JSObject pending = null;

    @Override
    public void load() {
        try {
            Intent intent = getActivity().getIntent();
            if (take(intent)) getActivity().setIntent(new Intent());   // 处理过了，重建页面时不再处理一遍
        } catch (Exception ignored) {}
    }

    @Override
    protected void handleOnNewIntent(Intent intent) {
        super.handleOnNewIntent(intent);
        try {
            if (take(intent)) notifyListeners("fileOpened", new JSObject());
        } catch (Exception ignored) {}
    }

    @PluginMethod
    public void getPending(PluginCall call) {
        JSObject ret = new JSObject();
        if (pending != null) ret.put("file", pending);
        pending = null;
        call.resolve(ret);
    }

    // 是打开 / 分享过来的文件就读进来，返回 true
    private boolean take(Intent intent) {
        if (intent == null) return false;
        String action = intent.getAction();
        Uri uri = null;
        if (Intent.ACTION_VIEW.equals(action)) {
            uri = intent.getData();
        } else if (Intent.ACTION_SEND.equals(action)) {
            Object x = intent.getParcelableExtra(Intent.EXTRA_STREAM);
            if (x instanceof Uri) uri = (Uri) x;
        }
        if (uri == null) return false;
        JSObject f = new JSObject();
        f.put("name", displayName(uri));
        InputStream is = null;
        try {
            is = getContext().getContentResolver().openInputStream(uri);
            if (is == null) {
                f.put("error", "open_failed");
            } else {
                ByteArrayOutputStream out = new ByteArrayOutputStream();
                byte[] buf = new byte[65536];
                int n, total = 0;
                boolean tooBig = false;
                while ((n = is.read(buf)) != -1) {
                    total += n;
                    if (total > MAX_BYTES) { tooBig = true; break; }
                    out.write(buf, 0, n);
                }
                if (tooBig) f.put("error", "too_big");
                else {
                    f.put("data", Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP));
                    f.put("size", total);
                }
            }
        } catch (Exception e) {
            f.put("error", "read_failed");
        } finally {
            if (is != null) {
                try { is.close(); } catch (Exception ignored) {}
            }
        }
        pending = f;
        return true;
    }

    private String displayName(Uri uri) {
        String name = uri.getLastPathSegment();
        Cursor cursor = null;
        try {
            cursor = getContext().getContentResolver().query(uri, null, null, null, null);
            if (cursor != null) {
                int idx = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME);
                if (idx >= 0 && cursor.moveToFirst()) name = cursor.getString(idx);
            }
        } catch (Exception ignored) {
        } finally {
            if (cursor != null) cursor.close();
        }
        return name == null ? "账单文件" : name;
    }
}
