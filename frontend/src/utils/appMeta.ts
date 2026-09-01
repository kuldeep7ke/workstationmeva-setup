// Release metadata for the whole app. Bump here + in package.json when a new
// version ships. This is a pre-release beta under public-domain (Unlicense).
export const APP_VERSION = '1.0.0-beta.1';
export const APP_STATUS = 'Beta';
export const TESTING_MODE = true;
export const APP_LICENSE = 'Public Domain (Unlicense)';
export const APP_REPO_URL = 'https://github.com/kuldeep7ke/workstationmeva-setup';

export function getAppVersionLabel(): string {
  return `v${APP_VERSION} ${APP_STATUS}`;
}

export function isTestingMode(): boolean {
  return TESTING_MODE;
}