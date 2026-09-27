const express = require('express');
const {
  createSetBalanceConfig,
  forceRefreshCloudFrontAuthCookies,
  redeemYaiTicket,
  ensureYaiLibreChatUser,
  isValidYaiServiceSecret,
  revokeYaiUserSessions,
} = require('@librechat/api');
const {
  resetPasswordRequestController,
  resetPasswordController,
  registrationController,
  graphTokenController,
  refreshController,
} = require('~/server/controllers/AuthController');
const {
  regenerateBackupCodes,
  disable2FA,
  confirm2FA,
  enable2FA,
  verify2FA,
} = require('~/server/controllers/TwoFactorController');
const { verify2FAWithTempToken } = require('~/server/controllers/auth/TwoFactorAuthController');
const { logoutController } = require('~/server/controllers/auth/LogoutController');
const { loginController } = require('~/server/controllers/auth/LoginController');
const db = require('~/models');
const { findBalanceByUser, upsertBalanceFields } = db;
const { setAuthTokens } = require('~/server/services/AuthService');
const { getAppConfig } = require('~/server/services/Config');
const middleware = require('~/server/middleware');

const setBalanceConfig = createSetBalanceConfig({
  getAppConfig,
  findBalanceByUser,
  upsertBalanceFields,
});

const router = express.Router();
router.post('/yai/handoff', async (req, res) => {
  const { ticket, accountId } = req.body ?? {};
  try {
    const identity = await redeemYaiTicket({
      ticket,
      accountId,
      apiBaseUrl: process.env.YAI_API_BASE_URL,
      serviceSecret: process.env.YAI_LIBRECHAT_SERVICE_KEY,
    });
    await ensureYaiLibreChatUser(accountId, identity, {
      findById: (id) => db.findUser({ _id: id }),
      create: (user) => db.createUser(user, undefined, true, true),
      update: (id, user) => db.updateUser(id, user),
    });
    await setAuthTokens(accountId, res, null, req);
    return res.status(200).json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'YAI sign-in failed';
    const status = /rejected \((400|401|403|404)\)/.test(message) ? 401 : 502;
    return res.status(status).json({ error: 'YAI sign-in failed' });
  }
});

router.post('/yai/revoke', async (req, res) => {
  if (
    !isValidYaiServiceSecret(
      req.get('x-yai-librechat-service-key'),
      process.env.YAI_LIBRECHAT_SERVICE_KEY,
    )
  ) {
    return res.sendStatus(401);
  }
  try {
    await revokeYaiUserSessions(req.body?.userId, {
      findLinkedAccounts: (userId) =>
        db.findUsers({ idOnTheSource: { $regex: `^yai:${userId}:` } }, '_id'),
      rotateSessionVersion: (accountId, version) =>
        db.updateUser(accountId, { yaiSessionVersion: version }),
      deleteAllSessions: (accountId) => db.deleteAllUserSessions(accountId),
    });
    return res.sendStatus(204);
  } catch {
    return res.sendStatus(500);
  }
});
const getCloudFrontAuthCookieRefreshResult = (req, res) => {
  const warmedResult = req.cloudFrontAuthCookieRefreshResult;
  if (warmedResult && (warmedResult.attempted || !warmedResult.enabled)) {
    return warmedResult;
  }

  return forceRefreshCloudFrontAuthCookies(req, res, req.user);
};

const ldapAuth = !!process.env.LDAP_URL && !!process.env.LDAP_USER_SEARCH_BASE;
//Local
router.post('/logout', middleware.requireJwtAuth, logoutController);
router.post(
  '/login',
  middleware.logHeaders,
  middleware.loginLimiter,
  middleware.checkBan,
  middleware.validateEmailLogin,
  ldapAuth ? middleware.requireLdapAuth : middleware.requireLocalAuth,
  setBalanceConfig,
  loginController,
);
router.post('/refresh', refreshController);
router.post('/cloudfront/refresh', middleware.requireJwtAuth, (req, res) => {
  const result = getCloudFrontAuthCookieRefreshResult(req, res);
  if (!result.enabled) {
    return res.sendStatus(404);
  }

  const status = result.refreshed ? 200 : 500;
  return res.status(status).json({
    ok: result.refreshed,
    expiresInSec: result.expiresInSec,
    refreshAfterSec: result.refreshAfterSec,
  });
});
router.post(
  '/register',
  middleware.registerLimiter,
  middleware.checkBan,
  middleware.checkInviteUser,
  middleware.validateRegistration,
  registrationController,
);
router.post(
  '/requestPasswordReset',
  middleware.resetPasswordLimiter,
  middleware.checkBan,
  middleware.validatePasswordReset,
  resetPasswordRequestController,
);
router.post(
  '/resetPassword',
  middleware.resetPasswordSubmissionLimiter,
  middleware.checkBan,
  middleware.validatePasswordReset,
  resetPasswordController,
);

router.post('/2fa/enable', middleware.requireJwtAuth, enable2FA);
router.post('/2fa/verify', middleware.requireJwtAuth, verify2FA);
router.post(
  '/2fa/verify-temp',
  middleware.setTwoFactorTempUser,
  middleware.twoFactorTempLimiter,
  middleware.checkBan,
  verify2FAWithTempToken,
);
router.post('/2fa/confirm', middleware.requireJwtAuth, confirm2FA);
router.post('/2fa/disable', middleware.requireJwtAuth, disable2FA);
router.post('/2fa/backup/regenerate', middleware.requireJwtAuth, regenerateBackupCodes);

router.get('/graph-token', middleware.requireJwtAuth, graphTokenController);

module.exports = router;
