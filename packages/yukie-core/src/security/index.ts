/**
 * Security Module
 *
 * Exports all security-related functionality.
 */

// Risk Classifier
export {
  RiskClassifier,
  getRiskClassifier,
  resetRiskClassifier,
  type RiskAssessment,
  type RiskRule,
  type RiskMatch,
} from './risk-classifier';

// Confirmation Gate
export {
  ConfirmationGate,
  getConfirmationGate,
  resetConfirmationGate,
  type ConfirmationRequest,
  type ConfirmationResponse,
  type ConfirmationCallback,
} from './confirmation-gate';

// Input Sanitizer
export {
  InputSanitizer,
  getInputSanitizer,
  resetInputSanitizer,
  type SanitizationResult,
  type SanitizationWarning,
  type SanitizationBlock,
  type SanitizationOptions,
} from './input-sanitizer';
