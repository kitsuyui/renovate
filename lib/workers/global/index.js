const { initLogger } = require('../../logger');
const configParser = require('../../config');
const repositoryWorker = require('../repository');

module.exports = {
  start,
  getRepositoryConfig,
};

async function start() {
  initLogger();
  try {
    const config = await configParser.parseConfigs(process.env, process.argv);
    if (config.repositories.length === 0) {
      logger.warn(
        'No repositories found - did you want to run with flag --autodiscover?'
      );
    }
    // Move global variables that we need to use later
    const importGlobals = ['exposeEnv', 'prBanner', 'prFooter'];
    config.global = {};
    importGlobals.forEach(key => {
      config.global[key] = config[key];
      delete config[key];
    });
    // Iterate through repositories sequentially
    for (const repository of config.repositories) {
      const repoConfig = getRepositoryConfig(config, repository);
      await repositoryWorker.renovateRepository(repoConfig);
    }
    logger.setMeta({});
    logger.info('Renovate finished');
  } catch (err) {
    logger.fatal(`Renovate fatal error: ${err.message}`);
    logger.error(err);
  }
}

function getRepositoryConfig(globalConfig, repository) {
  const repoConfig = configParser.mergeChildConfig(
    globalConfig,
    typeof repository === 'string' ? { repository } : repository
  );
  repoConfig.isGitHub = repoConfig.platform === 'github';
  repoConfig.isGitLab = repoConfig.platform === 'gitlab';
  repoConfig.isVsts = repoConfig.platform === 'vsts';
  return configParser.filterConfig(repoConfig, 'repository');
}
