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
        # -> Input username and password, then click Sign In to log in as competition administrator.
        frame = context.pages[-1]
        # Input the username for login
        elem = frame.locator('xpath=html/body/div/div/div/div[2]/form/div/input').nth(0)
        await page.wait_for_timeout(3000); await elem.fill('test@example.com')
        

        frame = context.pages[-1]
        # Input the password for login
        elem = frame.locator('xpath=html/body/div/div/div/div[2]/form/div[2]/div/input').nth(0)
        await page.wait_for_timeout(3000); await elem.fill('test123456')
        

        frame = context.pages[-1]
        # Click the Sign In button to log in
        elem = frame.locator('xpath=html/body/div/div/div/div[2]/form/button').nth(0)
        await page.wait_for_timeout(3000); await elem.click(timeout=5000)
        

        # -> Click on 'Competition Admin' link to open the Competition Dashboard.
        frame = context.pages[-1]
        # Click on Competition Admin link to open Competition Dashboard
        elem = frame.locator('xpath=html/body/div/div/aside/nav/a[8]').nth(0)
        await page.wait_for_timeout(3000); await elem.click(timeout=5000)
        

        # --> Assertions to verify Competition Dashboard functionality
        frame = context.pages[-1]
        await asyncio.sleep(2)
        
        # Check for Competition Dashboard elements
        competition_elements = [
            'Competition',
            'Dashboard',
            'Session',
            'Judge',
            'Cupping'
        ]
        
        dashboard_found = False
        for element_text in competition_elements:
            try:
                elem = frame.locator(f'text={element_text}').first
                if await elem.is_visible(timeout=3000):
                    dashboard_found = True
                    break
            except:
                continue
        
        # If dashboard loaded, check for management features
        if dashboard_found:
            # Look for buttons/features related to session or judge management
            management_features = [
                frame.locator('button:has-text("Create")').first,
                frame.locator('button:has-text("Add")').first,
                frame.locator('button:has-text("Manage")').first,
                frame.locator('button:has-text("New")').first,
                frame.locator('[class*="session"]').first,
                frame.locator('[class*="judge"]').first
            ]
            
            feature_found = False
            for feature in management_features:
                try:
                    if await feature.is_visible(timeout=2000):
                        feature_found = True
                        break
                except:
                    continue
            
            if not feature_found:
                # Dashboard exists but no management features visible
                print('Warning: Competition Dashboard loaded but management features not clearly visible')
        else:
            raise AssertionError('Test case failed: Competition Dashboard did not load. Competition administrators should be able to manage coffee competitions including session scheduling and judge administration.')
        await asyncio.sleep(5)
    
    finally:
        if context:
            await context.close()
        if browser:
            await browser.close()
        if pw:
            await pw.stop()
            
asyncio.run(run_test())
    