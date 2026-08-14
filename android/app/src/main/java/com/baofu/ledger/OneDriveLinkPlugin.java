package com.baofu.ledger;

import android.app.Activity;
import android.content.ContentResolver;
import android.content.Intent;
import android.content.UriPermission;
import android.database.Cursor;
import android.net.Uri;
import android.provider.OpenableColumns;

import androidx.activity.result.ActivityResult;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

/**
 * 让网页层直接连接一个「文档」（可以是 OneDrive App 提供的云端文件），
 * 并在拿到系统授权后长期读写它 —— 不需要接入任何官方登录 / OAuth，
 * 完全借助手机上已经登录的 OneDrive App 本身，通过安卓的
 * Storage Access Framework（存储访问框架）实现。
 *
 * 用法（JS 侧）：
 *   pickFile({mode:'create'|'open', suggestedName?}) -> {uri, name}   // 选一次，弹系统选择器
 *   writeText({uri, text})                                            // 覆盖写入
 *   readText({uri}) -> {text}                                         // 读取全部内容
 *   checkAccess({uri}) -> {ok}                                        // 授权是否还在
 *   forget({uri})                                                     // 主动放弃授权
 */
@CapacitorPlugin(name = "OneDriveLink")
public class OneDriveLinkPlugin extends Plugin {

    @PluginMethod
    public void pickFile(PluginCall call) {
        String mode = call.getString("mode", "create");
        String suggestedName = call.getString("suggestedName", "记问存档.json");

        Intent intent;
        if ("open".equals(mode)) {
            intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        } else {
            intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
            intent.putExtra(Intent.EXTRA_TITLE, suggestedName);
        }
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType("application/json");
        try {
            startActivityForResult(call, intent, "pickFileResult");
        } catch (Exception e) {
            call.reject("no_document_provider: " + e.getMessage());
        }
    }

    @ActivityCallback
    private void pickFileResult(PluginCall call, ActivityResult result) {
        if (call == null) return;
        if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null) {
            call.reject("cancelled");
            return;
        }
        Uri uri = result.getData().getData();
        if (uri == null) {
            call.reject("no_uri");
            return;
        }
        try {
            getContext().getContentResolver().takePersistableUriPermission(
                uri,
                Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION
            );
        } catch (Exception e) {
            // 少数文档提供方不支持持久授权，忽略——后续读写失败时 JS 侧会捕获并提示重连
        }
        JSObject ret = new JSObject();
        ret.put("uri", uri.toString());
        ret.put("name", queryDisplayName(uri));
        call.resolve(ret);
    }

    @PluginMethod
    public void writeText(PluginCall call) {
        String uriStr = call.getString("uri");
        String text = call.getString("text");
        if (uriStr == null || text == null) {
            call.reject("missing_params");
            return;
        }
        OutputStream os = null;
        try {
            Uri uri = Uri.parse(uriStr);
            os = getContext().getContentResolver().openOutputStream(uri, "wt");
            if (os == null) {
                call.reject("open_failed");
                return;
            }
            os.write(text.getBytes(StandardCharsets.UTF_8));
            os.flush();
            call.resolve();
        } catch (Exception e) {
            call.reject("write_failed: " + e.getMessage());
        } finally {
            if (os != null) {
                try { os.close(); } catch (Exception ignored) {}
            }
        }
    }

    @PluginMethod
    public void readText(PluginCall call) {
        String uriStr = call.getString("uri");
        if (uriStr == null) {
            call.reject("missing_params");
            return;
        }
        InputStream is = null;
        try {
            Uri uri = Uri.parse(uriStr);
            is = getContext().getContentResolver().openInputStream(uri);
            if (is == null) {
                call.reject("open_failed");
                return;
            }
            BufferedReader reader = new BufferedReader(new InputStreamReader(is, StandardCharsets.UTF_8));
            StringBuilder sb = new StringBuilder();
            char[] buf = new char[4096];
            int n;
            while ((n = reader.read(buf)) != -1) {
                sb.append(buf, 0, n);
            }
            JSObject ret = new JSObject();
            ret.put("text", sb.toString());
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("read_failed: " + e.getMessage());
        } finally {
            if (is != null) {
                try { is.close(); } catch (Exception ignored) {}
            }
        }
    }

    @PluginMethod
    public void checkAccess(PluginCall call) {
        String uriStr = call.getString("uri");
        boolean ok = false;
        if (uriStr != null) {
            try {
                Uri target = Uri.parse(uriStr);
                ContentResolver cr = getContext().getContentResolver();
                for (UriPermission p : cr.getPersistedUriPermissions()) {
                    if (p.getUri().equals(target) && p.isWritePermission()) {
                        ok = true;
                        break;
                    }
                }
            } catch (Exception ignored) {}
        }
        JSObject ret = new JSObject();
        ret.put("ok", ok);
        call.resolve(ret);
    }

    @PluginMethod
    public void forget(PluginCall call) {
        String uriStr = call.getString("uri");
        if (uriStr != null) {
            try {
                Uri uri = Uri.parse(uriStr);
                getContext().getContentResolver().releasePersistableUriPermission(
                    uri,
                    Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION
                );
            } catch (Exception ignored) {}
        }
        call.resolve();
    }

    private String queryDisplayName(Uri uri) {
        String name = uri.getLastPathSegment();
        Cursor cursor = null;
        try {
            cursor = getContext().getContentResolver().query(uri, null, null, null, null);
            if (cursor != null) {
                int idx = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME);
                if (idx >= 0 && cursor.moveToFirst()) {
                    name = cursor.getString(idx);
                }
            }
        } catch (Exception ignored) {
        } finally {
            if (cursor != null) cursor.close();
        }
        return name;
    }
}
