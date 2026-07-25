/**
 * FlowMD init 命令
 * 创建 .flow/ 配置目录
 */

import { mkdirSync, writeFileSync, existsSync, readFileSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import chalk from 'chalk';
import { confirm } from '../utils/prompt.js';

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
 */
export async function initCommand(): Promise<void> {
  const flowDir = join(process.cwd(), '.flow');

  // 检查 .flow 目录是否已存在
  if (existsSync(flowDir)) {
    const confirmed = await confirm('.flow/ 目录已存在，是否覆盖？');
    if (!confirmed) {
      console.log(chalk.yellow('⚠ 已取消'));
      return;
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

    console.log(chalk.green('✅ FlowMD 配置已初始化'));
    console.log('');
    console.log(chalk.blue('📁 已创建:'));
    console.log(chalk.gray('  .flow/config.yml          - 主配置文件'));
    console.log(chalk.gray('  .flow/credentials.yml.example - 凭据模板'));
    console.log(chalk.gray('  .flow/history/            - 历史记录目录'));
    console.log('');
    console.log(chalk.blue('📝 下一步:'));
    console.log(chalk.gray('  1. 复制 .flow/credentials.yml.example 为 .flow/credentials.yml'));
    console.log(chalk.gray('  2. 在 credentials.yml 中填入你的 API Key'));
    console.log(chalk.gray('  3. 运行 flow run <file> 开始使用'));
  } catch (error) {
    console.error(chalk.red(`❌ 初始化失败: ${error instanceof Error ? error.message : String(error)}`));
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
