/**
 * FlowMD init 命令
 * 创建 .flow/ 配置目录
 */

import { mkdirSync, writeFileSync, existsSync, readFileSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import chalk from 'chalk';
import { confirm } from '../utils/prompt.js';
import { t } from '../utils/i18n.js';

const DEFAULT_CONFIG = `# FlowMD 配置文件
# 详见文档了解更多信息

llm:
  provider: openai
  model: gpt-4o
  temperature: 0.7

dataSources: {}

execution:
  timeout: 30
`;

const CREDENTIALS_EXAMPLE = `# FlowMD 凭据配置
# 复制此文件为 credentials.yml 并填入你的值

llm:
  # OpenAI API Key（当 provider=openai 时需要）
  # apiKey: "sk-your-openai-api-key"
  
  # Anthropic API Key（当 provider=anthropic 时需要）
  # apiKey: "sk-ant-your-anthropic-api-key"

# 数据库凭据示例
# dataSources:
#   mydb:
#     type: sqlite
#     filename: "./data.db"
`;

/**
 * 执行 init 命令
 * @param force - 是否强制覆盖
 */
export async function initCommand(force?: boolean): Promise<void> {
  const flowDir = join(process.cwd(), '.flow');

  // 检查 .flow 目录是否已存在
  if (existsSync(flowDir)) {
    if (force) {
      console.log(chalk.yellow(t('common.overwrite')));
    } else {
      const confirmed = await confirm(t('init.confirmOverwrite'));
      if (!confirmed) {
        console.log(chalk.yellow(t('common.cancelled')));
        return;
      }
    }
  }

  try {
    // 创建 .flow 目录
    mkdirSync(flowDir, { recursive: true });

    // 创建 config.yml
    writeFileSync(join(flowDir, 'config.yml'), DEFAULT_CONFIG, 'utf-8');

    // 创建 credentials.yml.example
    writeFileSync(join(flowDir, 'credentials.yml.example'), CREDENTIALS_EXAMPLE, 'utf-8');

    // 创建 history 目录
    mkdirSync(join(flowDir, 'history'), { recursive: true });

    // 更新 .gitignore
    updateGitignore();

    console.log(chalk.green(t('init.done')));
    console.log('');
    console.log(chalk.blue(t('init.created')));
    console.log(chalk.gray(t('init.createdConfig')));
    console.log(chalk.gray(t('init.createdCredentials')));
    console.log(chalk.gray(t('init.createdHistory')));
    console.log('');
    console.log(chalk.blue(t('init.nextSteps')));
    console.log(chalk.gray(t('init.step1')));
    console.log(chalk.gray(t('init.step2')));
    console.log(chalk.gray(t('init.step3')));
  } catch (error) {
    console.error(chalk.red(t('cli.initFailed', { error: error instanceof Error ? error.message : String(error) })));
  }
}

/**
 * 更新 .gitignore 以排除凭据文件
 */
function updateGitignore(): void {
  const gitignorePath = join(process.cwd(), '.gitignore');
  const credentialEntry = '.flow/credentials.yml';

  if (existsSync(gitignorePath)) {
    const content = readFileSync(gitignorePath, 'utf-8');
    if (!content.includes(credentialEntry)) {
      appendFileSync(gitignorePath, `\n${credentialEntry}\n`, 'utf-8');
    }
  } else {
    writeFileSync(gitignorePath, `${credentialEntry}\n`, 'utf-8');
  }
}
