// 测试进程预先载入（node -r ./tools/inline-hook.js xxx.test.js）：读 index.html 时把拆开的 app/*.js、app/*.css 拼回单文件，
// 老测试拿到的还是一整份 HTML，一条不用改。run-all.js 每个测试都带上它；单独跑一个测试时也要带：
//   node -r ./tools/inline-hook.js a-basics.test.js
require('./inline').installReadHook();
