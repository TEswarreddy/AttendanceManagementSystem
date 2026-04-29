const { Router } = require("express");

const authController = require("../controllers/authController");
const { protect } = require("../middlewares/authMiddleware");
const {
  validate,
  loginRules,
  forgotPasswordRules,
  resetPasswordRules,
  changePasswordRules,
} = require("../middlewares/validate");
const { authLimiter, reportLimiter } = require("../middlewares/rateLimiter");

/*
 * Auth Routes
 *
 * POST /login
 * - Auth: Public
 * - Validation: loginRules
 * - Rate limit: authLimiter (router-level)
 *
 * POST /logout
 * - Auth: protect
 * - Validation: none
 * - Rate limit: authLimiter (router-level)
 *
 * POST /refresh-token
 * - Auth: Public (requires refresh token in body)
 * - Validation: none
 * - Rate limit: authLimiter (router-level)
 *
 * GET /me
 * - Auth: protect
 * - Validation: none
 * - Rate limit: authLimiter (router-level)
 *
 * POST /forgot-password
 * - Auth: Public
 * - Validation: forgotPasswordRules
 * - Rate limit: authLimiter (router-level)
 *
 * POST /reset-password
 * - Auth: Public
 * - Validation: resetPasswordRules
 * - Rate limit: authLimiter (router-level)
 *
 * PUT /change-password
 * - Auth: protect
 * - Validation: changePasswordRules
 * - Rate limit: authLimiter (router-level)
 *
 * Note: reportLimiter is imported for parity with shared middleware imports.
 */

const router = Router();

router.use(authLimiter);
void reportLimiter;

router.post("/login", validate(loginRules), authController.login);
router.post("/logout", protect, authController.logout);
router.post("/refresh-token", authController.refreshToken);
router.get("/me", protect, authController.getMe);
router.get("/profile", protect, authController.getProfile);
router.post("/profile", protect, authController.createProfile);
router.put("/profile", protect, authController.updateProfile);
router.delete("/profile", protect, authController.deleteProfile);
router.post(
  "/forgot-password",
  validate(forgotPasswordRules),
  authController.forgotPassword
);
router.post(
  "/reset-password",
  validate(resetPasswordRules),
  authController.resetPassword
);
router.put(
  "/change-password",
  protect,
  validate(changePasswordRules),
  authController.changePassword
);

module.exports = router;
