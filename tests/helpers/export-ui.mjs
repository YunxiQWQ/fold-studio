// Drive the public export dialog, including the final action for formats that
// used to download immediately. No private functions or hidden controls.
export async function chooseExport(page,target,format,downloadNow=false){
  if(!await page.locator('#export-dialog').isVisible())await page.locator('#export-toggle').click();
  await page.locator('#export-target').selectOption(target);
  await page.locator('#export-format').selectOption(format);
  if(downloadNow)await page.locator('#confirm-export').click();
}
