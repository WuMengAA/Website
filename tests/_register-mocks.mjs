// 在 node --test 的每个子进程里注册 TS/别名 mock 钩子。
// 用法：node --test --import ./tests/_register-mocks.mjs tests/*.test.mjs
import { register } from "node:module";
register("./_ts-hooks.mjs", import.meta.url);
