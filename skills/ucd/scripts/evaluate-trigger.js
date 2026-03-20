#!/usr/bin/env node
'use strict';

const UI_PATH_REGEX = /(^|\/)(web|frontend|ui|ux|design|components|screens|pages)(\/|$)|\.(tsx|jsx|vue|css|scss|sass|fig|sketch|xd)$/i;
const BACKEND_PATH_REGEX = /(^|\/)(src\/server|server|api|backend|db|migrations|scripts)(\/|$)|\.(sql|sh)$/i;
const INFRA_PATH_REGEX = /(^|\/)(infra|terraform|k8s|helm|docker|ci|github\/workflows)(\/|$)|dockerfile/i;
const DESIGN_INTENT_REGEX = /\b(ui|ux|design|wireframe|prototype|visual|layout|interaction)\b/i;

const REASON_CODES = Object.freeze({
  UI_NEW_SURFACE: 'UI_NEW_SURFACE',
  UI_FLOW_CHANGE: 'UI_FLOW_CHANGE',
  DESIGN_SYSTEM_CHANGE: 'DESIGN_SYSTEM_CHANGE',
  EXPLICIT_DESIGN_REQUEST: 'EXPLICIT_DESIGN_REQUEST',
  NON_UI_BACKEND_ONLY: 'NON_UI_BACKEND_ONLY',
  NON_UI_INFRA_ONLY: 'NON_UI_INFRA_ONLY',
  NON_UI_TEXT_ONLY: 'NON_UI_TEXT_ONLY',
  MANUAL_OVERRIDE: 'MANUAL_OVERRIDE',
});

function normalizeStringArray(value) {
  if (!Array.isArray(value)) return [];
  return value.filter((entry) => typeof entry === 'string').map((entry) => entry.trim()).filter(Boolean);
}

function parseInput() {
  const raw = JSON.parse(process.argv[2] || '{}');
  const changedPaths = normalizeStringArray(raw.changed_paths);
  const userIntentFlags = normalizeStringArray(raw.user_intent_flags);
  const taskDescription = typeof raw.task_description === 'string' ? raw.task_description : '';
  const overrideRequested = Boolean(raw.override_requested);
  const overrideRequiredValue = typeof raw.override_ucd_required === 'boolean' ? raw.override_ucd_required : undefined;
  const overrideReason = typeof raw.override_reason === 'string' ? raw.override_reason.trim() : '';
  return {
    taskDescription,
    changedPaths,
    userIntentFlags,
    overrideRequested,
    overrideRequiredValue,
    overrideReason,
  };
}

function dedupeReasons(reasons) {
  return [...new Set(reasons)];
}

function evaluate(input) {
  const reasons = [];
  const uiPath = input.changedPaths.some((entry) => UI_PATH_REGEX.test(entry));
  const backendOnlyPathSignal = input.changedPaths.length > 0 && input.changedPaths.every((entry) => BACKEND_PATH_REGEX.test(entry));
  const infraOnlyPathSignal = input.changedPaths.length > 0 && input.changedPaths.every((entry) => INFRA_PATH_REGEX.test(entry));
  const textOnlySignal = input.changedPaths.length > 0 && input.changedPaths.every((entry) => /\.(md|txt|rst)$/i.test(entry));

  const explicitDesignIntent = input.userIntentFlags.some((entry) => DESIGN_INTENT_REGEX.test(entry));
  const descriptionHintsDesign = DESIGN_INTENT_REGEX.test(input.taskDescription);

  if (uiPath) reasons.push(REASON_CODES.UI_NEW_SURFACE);
  if (explicitDesignIntent || descriptionHintsDesign) reasons.push(REASON_CODES.EXPLICIT_DESIGN_REQUEST);
  if (backendOnlyPathSignal) reasons.push(REASON_CODES.NON_UI_BACKEND_ONLY);
  if (infraOnlyPathSignal) reasons.push(REASON_CODES.NON_UI_INFRA_ONLY);
  if (textOnlySignal) reasons.push(REASON_CODES.NON_UI_TEXT_ONLY);

  const requiresByPositiveSignal = reasons.some((reason) => (
    reason === REASON_CODES.UI_NEW_SURFACE
    || reason === REASON_CODES.UI_FLOW_CHANGE
    || reason === REASON_CODES.DESIGN_SYSTEM_CHANGE
    || reason === REASON_CODES.EXPLICIT_DESIGN_REQUEST
  ));

  const falseConditionAllTrue = (
    (backendOnlyPathSignal || infraOnlyPathSignal || textOnlySignal || input.changedPaths.length === 0)
    && !uiPath
    && !explicitDesignIntent
    && !descriptionHintsDesign
  );

  let ucdRequired = requiresByPositiveSignal || !falseConditionAllTrue;

  if (falseConditionAllTrue) {
    ucdRequired = false;
    if (!backendOnlyPathSignal && !infraOnlyPathSignal && !textOnlySignal) {
      reasons.push(REASON_CODES.NON_UI_TEXT_ONLY);
    }
  }

  if (input.overrideRequested) {
    reasons.push(REASON_CODES.MANUAL_OVERRIDE);
    if (typeof input.overrideRequiredValue === 'boolean') {
      ucdRequired = input.overrideRequiredValue;
    }
  }

  return {
    ucd_required: ucdRequired,
    reason_codes: dedupeReasons(reasons),
    ucd_override_reason: input.overrideReason || null,
  };
}

function main() {
  try {
    const input = parseInput();
    const result = evaluate(input);
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch (error) {
    process.stderr.write(JSON.stringify({ error: 'TRIGGER_EVALUATION_FAILED', details: String(error.message || error) }));
    process.stderr.write('\n');
    process.exit(1);
  }
}

main();
