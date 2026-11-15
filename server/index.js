import { createReflectServer } from './app.js';

const server = createReflectServer();
const port = Number(process.env.PORT || 8817);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be a valid TCP port');

server.listen(port, '127.0.0.1', () => {
  console.log(`Reflect reply server listening on http://127.0.0.1:${port}`);
});
