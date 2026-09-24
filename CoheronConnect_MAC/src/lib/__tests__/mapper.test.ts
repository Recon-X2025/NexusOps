import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mapOrgToTenantRecord } from '../wizardData.ts';
import { computeCompletion } from '../validation.ts';

test('mapOrgToTenantRecord + computeCompletion returns 100% and status complete for fully populated org', () => {
  const realApiJsonResponse = {
    id: 'org_cm67890def',
    name: 'TestOrg',
    slug: 'testorg',
    plan: 'enterprise',
    status: 'complete',
    onboardingStep: 7,
    onboardingCompletedAt: '2026-07-19T10:00:00.000Z',
    onboardingCompletedBy: 'admin@coheron.tech',
    onboardingLastEditedBy: 'operator@coheron.tech',
    suspended: false,
    flagged: false,
    createdAt: '2026-07-16T12:00:00.000Z',
    updatedAt: '2026-07-19T10:00:00.000Z',
    profile: {
      displayName: 'TestOrg Pvt Ltd',
      industry: 'Information Technology',
      companySize: '51-200',
      city: 'Bengaluru',
      state: 'Karnataka',
      website: 'https://testorg.coheron.tech',
      supportEmail: 'support@testorg.coheron.tech',
    },
    compliance: {
      gstin: '29ABCDE1234F1Z5',
      pan: 'ABCDE1234F',
      cin: 'L12345KA2020PLC123456',
      tan: 'ABCD12345E',
      epfCode: 'BGBLR1234567000',
      primaryStateCode: 'KA',
    },
    itsm: {
      slaP1Hours: 4,
      slaP2Hours: 8,
      slaP3Hours: 24,
      slaP4Hours: 48,
    },
  };

  const record = mapOrgToTenantRecord(realApiJsonResponse);
  const completion = computeCompletion(record.steps);

  assert.equal(completion, 100, `Expected completion to be 100%, but got ${completion}%`);
  assert.equal(record.status, 'complete', `Expected status to be 'complete', but got ${record.status}`);
  assert.equal(record.companyName, 'TestOrg');
  assert.equal(record.currentStep, 7);
  assert.equal(record.onboardingCompletedBy, 'admin@coheron.tech');
  assert.equal(record.onboardingLastEditedBy, 'operator@coheron.tech');

  // Check Step 2 profile fields
  const step2 = record.steps.find((s) => s.id === 2);
  assert.ok(step2?.hasData);
  assert.equal(step2?.data?.industry, 'Information Technology');
  assert.equal(step2?.data?.city, 'Bengaluru');

  // Check Step 3 compliance fields
  const step3 = record.steps.find((s) => s.id === 3);
  assert.ok(step3?.hasData);
  assert.equal(step3?.data?.gstin, '29ABCDE1234F1Z5');
  assert.equal(step3?.data?.cin, 'L12345KA2020PLC123456');

  // Check Step 5 ITSM fields
  const step5 = record.steps.find((s) => s.id === 5);
  assert.ok(step5?.hasData);
  assert.equal(step5?.data?.p1Critical, 4);
});
