const { initRepo } = require('./init');
const { determineUpdates } = require('./updates');
const { ensureOnboardingPr } = require('./onboarding/pr');
const { writeUpdates } = require('./write');
const { handleError } = require('./error');
const { finaliseRepo } = require('./finalise');
const { processResult } = require('./result');
const { resolvePackageFiles } = require('../../manager');
const { sortBranches } = require('./process/sort');

module.exports = {
  renovateRepository,
};

async function renovateRepository(repoConfig) {
  let config = { ...repoConfig };
  logger.setMeta({ repository: config.repository });
  logger.info('Renovating repository');
  logger.trace({ config }, 'renovateRepository()');
  let commonConfig;
  let res;
  try {
    config = await initRepo(config);
    if (config.baseBranches && config.baseBranches.length) {
      // At this point we know if we have multiple branches
      // Do the following for every branch
      commonConfig = JSON.parse(JSON.stringify(config));
      const configs = [];
      logger.info({ baseBranches: config.baseBranches }, 'baseBranches');
      for (const [index, baseBranch] of commonConfig.baseBranches.entries()) {
        config = JSON.parse(JSON.stringify(commonConfig));
        config.baseBranch = baseBranch;
        config.branchPrefix +=
          config.baseBranches.length > 1 ? `${baseBranch}-` : '';
        platform.setBaseBranch(baseBranch);
        config = await resolvePackageFiles(config);
        config = await determineUpdates(config);
        configs[index] = config;
      }
      // Combine all the results into one
      for (const [index, entry] of configs.entries()) {
        if (index === 0) {
          config = entry;
        } else {
          config.branches = config.branches.concat(entry.branches);
        }
      }
      // istanbul ignore next
      config.branchList = config.branches.map(branch => branch.branchName);
    } else {
      config = await resolvePackageFiles(config);
      config = await determineUpdates(config);
    }
    sortBranches(config.branches);
    res = config.repoIsOnboarded
      ? await writeUpdates(config)
      : await ensureOnboardingPr(config, config.branches);
    logger.setMeta({ repository: config.repository });
    config.branchPrefix = commonConfig
      ? commonConfig.branchPrefix
      : config.branchPrefix;
    await finaliseRepo(commonConfig || config, config.branchList);
  } catch (err) /* istanbul ignore next */ {
    res = await handleError(config, err);
  }
  logger.info('Finished repository');
  return processResult(config, res);
}
