/**
 * FlowMD serve 命令
 * 启动本地 HTTP 服务，暴露 programmatic API
 */

import chalk from 'chalk';
import { createFlowServer } from '../core/serve/server.js';
import { handleExecute, handleExecuteBlock, handleHistory, handleTemplates, handleHealth, handleIde } from '../core/serve/routes.js';
import { t } from '../utils/i18n.js';

/**
 * 执行 serve 命令
 * @param opts - 选项：port, host
 */
export async function serveCommand(opts: { port?: string; host?: string } = {}): Promise<void> {
  const port = opts.port ? parseInt(opts.port, 10) : 5199;
  const host = opts.host || '127.0.0.1';

  const server = createFlowServer(
    [
      { method: 'GET', path: '/', handler: handleIde, rawHtml: true },
      { method: 'POST', path: '/execute', handler: handleExecute },
      { method: 'POST', path: '/execute-block', handler: handleExecuteBlock },
      { method: 'GET', path: '/history', handler: handleHistory },
      { method: 'GET', path: '/templates', handler: handleTemplates },
      { method: 'GET', path: '/health', handler: handleHealth },
    ],
    { port, host }
  );

  server.on('error', (error: NodeJS.ErrnoException) => {
    console.error(chalk.red(t('serve.error', { error: error.message })));
    process.exit(1);
  });

  server.listen(port, host, () => {
    console.log(chalk.blue(t('serve.started', { host, port })));
    console.log(chalk.gray(t('serve.endpoints')));
    console.log(chalk.gray(`  GET  /               ${t('serve.endpointIde')}`));
    console.log(chalk.gray(`  POST /execute     ${t('serve.endpointExecute')}`));
    console.log(chalk.gray(`  POST /execute-block ${t('serve.endpointExecuteBlock')}`));
    console.log(chalk.gray(`  GET  /history     ${t('serve.endpointHistory')}`));
    console.log(chalk.gray(`  GET  /templates   ${t('serve.endpointTemplates')}`));
    console.log(chalk.gray(`  GET  /health      ${t('serve.endpointHealth')}`));
    console.log(chalk.gray(t('serve.exitHint')));
  });

  // 优雅退出
  const shutdown = (): void => {
    console.log('');
    console.log(chalk.gray(t('serve.stopped')));
    server.close(() => process.exit(0));
    // 兜底：强制退出
    setTimeout(() => process.exit(0), 1000).unref();
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}
