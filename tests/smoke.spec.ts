import { expect, test } from '@playwright/test';

test('completes one full seeded draft round', async ({ page }) => {
  await page.goto('/');

  await page.fill('#userName', 'Playwright User');
  await page.fill('#groupCode', 'PLAYWRIGHT');
  await page.fill('#seed', 'playwright-seed');
  await page.getByTestId('start-game-button').click();

  await expect(page).toHaveURL(/\/draft/);

  for (let i = 0; i < 5; i += 1) {
    await expect(page.getByTestId('draw-progress')).toContainText(`Draw ${i + 1}/5`);
    await expect(page.getByTestId('player-option-0')).toBeVisible();

    await page.getByTestId('player-option-0').click();
    await page
      .locator('button[data-slot-open=\"true\"][data-slot-eligible=\"true\"]')
      .first()
      .click();
    await page.getByTestId('confirm-assignment').click();
    await page.getByTestId('confirm-submit').click();
  }

  await expect(page).toHaveURL(/\/results\/[A-Z0-9]+/);
  await expect(page.getByTestId('team-score')).toBeVisible();
  await expect(page.getByText('Seed:')).toBeVisible();
});
