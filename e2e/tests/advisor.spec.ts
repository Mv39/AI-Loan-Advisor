import { expect, Page, test } from '@playwright/test';

async function signIn(page: Page, name: RegExp) {
  await page.goto('/');
  await page.getByRole('button', { name }).click();
  await expect(page.locator('.rec').first()).toBeVisible();
}

const send = async (page: Page, text: string) => {
  await page.getByLabel('Your message').fill(text);
  await page.getByRole('button', { name: 'Send' }).click();
};

test.describe('LoanSense advisor', () => {
  test('salaried borrower sees ranked, explained options with full cost', async ({ page }) => {
    await signIn(page, /Priya/);
    const top = page.locator('.rec').first();
    await expect(top).toContainText('Top-up Loan');
    await expect(top).toContainText('APR (incl. fees)');
    await expect(top).toContainText('Total repayment');
    await expect(page.locator('.tradeoff')).toContainText('Shorter tenure');
  });

  test('free-text message updates the profile and re-prices options', async ({ page }) => {
    await signIn(page, /Priya/);
    await send(page, 'I need 3 lakh for home renovation over 2 years');
    await expect(page.locator('.msg').last()).toContainText('I updated your details');
    await expect(page.getByLabel('Loan amount (₹)')).toHaveValue('300000');
    await expect(page.locator('.rec').first()).toContainText('₹3,00,000');
  });

  test('multi-turn comparison renders a side-by-side table', async ({ page }) => {
    await signIn(page, /Priya/);
    await send(page, 'Compare personal loan and top-up');
    await expect(page.locator('.compare table')).toContainText('Flexi Personal Loan');
    await send(page, 'compare them for 48 months');
    await expect(page.locator('.compare table')).toContainText('48 months');
  });

  test('guardrails: approval guarantee refused and PAN redacted in the transcript', async ({ page }) => {
    await signIn(page, /Priya/);
    await send(page, 'Can you guarantee approval? My PAN is ABCDE1234F');
    await expect(page.locator('.msg').last()).toContainText('No one can guarantee loan approval');
    await expect(page.locator('.msg.user').last()).toContainText('[REDACTED_PAN]');
    await expect(page.locator('.chat-log')).not.toContainText('ABCDE1234F');
    await expect(page.locator('.badge.warn').last()).toContainText('PAN redacted');
  });

  test('gig worker only sees products they qualify for, with reasons for the rest', async ({ page }) => {
    await signIn(page, /Ananya/);
    await expect(page.locator('.rec')).toHaveCount(1);
    await expect(page.locator('.rec').first()).toContainText('Buy Now Pay Later');
    await page.getByText(/Not suitable right now/).click();
    await expect(page.locator('.not-eligible')).toContainText('Not offered to gig worker applicants');
  });

  test('summary downloads as a file', async ({ page }) => {
    await signIn(page, /Rahul/);
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: /Summary/ }).click();
    expect((await download).suggestedFilename()).toMatch(/^loan-summary-.*\.html$/);
  });

  test('Hindi mode returns a Hindi disclaimer', async ({ page }) => {
    await signIn(page, /Priya/);
    await page.getByRole('button', { name: 'हिं' }).click();
    await send(page, 'मेरे लिए कौन सा लोन सही है?');
    await page.locator('.disclaimer summary').last().click();
    await expect(page.locator('.disclaimer').last()).toContainText('अंडरराइटिंग');
  });
});
