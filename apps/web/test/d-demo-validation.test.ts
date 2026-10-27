// Unit tests for the demo request form's client-side checks (components/demo/demo-validation.ts).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  EMPTY_DEMO_FORM,
  fieldErrorsFromApi,
  firstNameOf,
  isValidEmail,
  isValidWebsite,
  normaliseDemoForm,
  normaliseWebsite,
  validateDemoForm,
} from '../components/demo/demo-validation.ts';

const good = { ...EMPTY_DEMO_FORM, fullName: 'Ada Lovelace', email: 'ada@example.com', company: 'Analytical Ltd' };

test('a complete form has no errors; only name, email and company are required', () => {
  assert.deepEqual(validateDemoForm(good), {});
  assert.deepEqual(Object.keys(validateDemoForm(EMPTY_DEMO_FORM)).sort(), ['company', 'email', 'fullName']);
});

test('email format and length', () => {
  for (const ok of ['a@b.co', 'first.last+tag@sub.example.org']) assert.equal(isValidEmail(ok), true, ok);
  for (const bad of [
    'ada',
    'ada@',
    '@x.com',
    'ada@example',
    'a b@example.com',
    'ada@example.c',
    `${'a'.repeat(250)}@x.com`,
  ])
    assert.equal(isValidEmail(bad), false, bad);
  assert.match(validateDemoForm({ ...good, email: 'nope' }).email ?? '', /name@company\.com/);
});

test('lengths, control characters and whitespace are checked after trimming', () => {
  assert.ok(validateDemoForm({ ...good, fullName: ' A ' }).fullName);
  assert.ok(validateDemoForm({ ...good, fullName: 'x'.repeat(121) }).fullName);
  assert.ok(validateDemoForm({ ...good, company: 'Bad\u0007Co' }).company);
  assert.equal(normaliseDemoForm({ ...good, fullName: '  Ada   Lovelace ' }).fullName, 'Ada Lovelace');
});

test('optional fields: industry from the list, phone digits, website URL', () => {
  assert.ok(validateDemoForm({ ...good, industry: 'aliens' }).industry);
  assert.equal(validateDemoForm({ ...good, industry: 'automotive' }).industry, undefined);
  assert.ok(validateDemoForm({ ...good, phone: '12' }).phone);
  assert.ok(validateDemoForm({ ...good, phone: 'call me' }).phone);
  assert.equal(validateDemoForm({ ...good, phone: '+44 (0)20 7946 0018' }).phone, undefined);
  assert.equal(normaliseWebsite('company.com'), 'https://company.com');
  assert.equal(isValidWebsite('https://company.com/about'), true);
  assert.equal(isValidWebsite('javascript:alert(1)'), false);
  assert.equal(isValidWebsite('https://localhost'), false);
  assert.ok(validateDemoForm({ ...good, website: 'not a site' }).website);
  assert.equal(validateDemoForm({ ...good, website: 'company.com' }).website, undefined);
});

test('server validation issues map onto fields; others are kept', () => {
  const mapped = fieldErrorsFromApi({
    error: 'validation_failed',
    details: {
      issues: [
        { path: ['email'], code: 'custom', message: 'Use your work address.' },
        { path: 'company', code: 'too_small', message: 'Too short.' },
        { path: ['formToken'], code: 'custom', message: 'Too fast.' },
      ],
    },
  });
  assert.deepEqual(mapped.fields, { email: 'Use your work address.', company: 'Too short.' });
  assert.deepEqual(mapped.other, ['Too fast.']);
  assert.deepEqual(mapped.paths, ['email', 'company', 'formToken']);
  assert.deepEqual(fieldErrorsFromApi({ details: { fields: { phone: 'Bad phone' } } }).fields, { phone: 'Bad phone' });
  assert.deepEqual(fieldErrorsFromApi({}).fields, {});
});

test('first name', () => {
  assert.equal(firstNameOf('  Ada Lovelace '), 'Ada');
  assert.equal(firstNameOf(null), '');
});
