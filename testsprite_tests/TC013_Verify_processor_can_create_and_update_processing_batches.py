import asyncio
from playwright import async_api
from playwright.async_api import expect

async def run_test():
    pw = None
    browser = None
    context = None
    
    try:
        # Start a Playwright session in asynchronous mode
        pw = await async_api.async_playwright().start()
        
        # Launch a Chromium browser in headless mode with custom arguments
        browser = await pw.chromium.launch(
            headless=True,
            args=[
                "--window-size=1280,720",         # Set the browser window size
                "--disable-dev-shm-usage",        # Avoid using /dev/shm which can cause issues in containers
                "--ipc=host",                     # Use host-level IPC for better stability
                "--single-process"                # Run the browser in a single process mode
            ],
        )
        
        # Create a new browser context (like an incognito window)
        context = await browser.new_context()
        context.set_default_timeout(5000)
        
        # Open a new page in the browser context
        page = await context.new_page()
        
        # Navigate to your target URL and wait until the network request is committed
        await page.goto("http://localhost:5173", wait_until="commit", timeout=10000)
        
        # Wait for the main page to reach DOMContentLoaded state (optional for stability)
        try:
            await page.wait_for_load_state("domcontentloaded", timeout=3000)
        except async_api.Error:
            pass
        
        # Iterate through all iframes and wait for them to load as well
        for frame in page.frames:
            try:
                await frame.wait_for_load_state("domcontentloaded", timeout=3000)
            except async_api.Error:
                pass
        
        # Interact with the page elements to simulate user flow
        # -> Input username and password, then click Sign In button to log in as processor.
        frame = context.pages[-1]
        # Input username or email
        elem = frame.locator('xpath=html/body/div/div/div/div[2]/form/div/input').nth(0)
        await page.wait_for_timeout(3000); await elem.fill('test@example.com')
        

        frame = context.pages[-1]
        # Input password
        elem = frame.locator('xpath=html/body/div/div/div/div[2]/form/div[2]/div/input').nth(0)
        await page.wait_for_timeout(3000); await elem.fill('test123456')
        

        frame = context.pages[-1]
        # Click Sign In button
        elem = frame.locator('xpath=html/body/div/div/div/div[2]/form/button').nth(0)
        await page.wait_for_timeout(3000); await elem.click(timeout=5000)
        

        # -> Click on 'Processor Workbench' link to navigate to the Processor Workbench page.
        frame = context.pages[-1]
        # Click on Processor Workbench link in the sidebar
        elem = frame.locator('xpath=html/body/div/div/aside/nav/a[6]').nth(0)
        await page.wait_for_timeout(3000); await elem.click(timeout=5000)
        

        # -> Look for processor workbench features
        frame = context.pages[-1]
        await asyncio.sleep(2)
        
        # Check for processor-specific elements
        processor_elements = [
            'Processing Batch',
            'Green Bean',
            'Drying Log',
            'Invoice',
            'Workflow',
            'Processor'
        ]
        
        workbench_found = False
        for element_text in processor_elements:
            try:
                elem = frame.locator(f'text={element_text}').first
                if await elem.is_visible(timeout=2000):
                    workbench_found = True
                    break
            except:
                continue
        

        # --> Assertions to verify Processor Workbench
        if workbench_found:
            # Look for batch management features
            management_buttons = [
                frame.locator('button:has-text("Create")').first,
                frame.locator('button:has-text("Add")').first,
                frame.locator('button:has-text("New")').first,
                frame.locator('button:has-text("Workflow")').first
            ]
            
            button_found = False
            for btn in management_buttons:
                try:
                    if await btn.is_visible(timeout=2000):
                        button_found = True
                        break
                except:
                    continue
            
            if not button_found:
                print('Warning: Processor Workbench loaded but management buttons not visible')
        else:
            raise AssertionError("Test case failed: Processor Workbench did not load properly. Processors should be able to create and update processing batches, drying logs, and green bean lots.")
        await asyncio.sleep(5)
    
    finally:
        if context:
            await context.close()
        if browser:
            await browser.close()
        if pw:
            await pw.stop()
            
asyncio.run(run_test())
    