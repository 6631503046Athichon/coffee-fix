import { readFileSync } from 'fs'
import path from 'path'

// F47: the site is flat (no gradients, no coloured glows) on gray/white with
// blue-600 as the primary colour. These screens had drifted: gradient cards
// and headers, and indigo buttons, focus borders and accents. Category
// colours (process types, role badges, the workbench stages) are not checked.

const read = (file: string) => readFileSync(path.resolve(__dirname, file), 'utf8')

const flatScreens = [
  'processor/ProcessorWorkbench.tsx',
  'common/DatePicker.tsx',
  'farmer/FarmerDashboard.tsx',
  'farmer/FarmerDataHub.tsx',
  'farmer/AddFarmPage.tsx',
  'farmer/FarmWeatherPanel.tsx',
  'auth/FirstLoginSetup.tsx',
  'admin/UserManagement.tsx',
]

describe('flat site colours (F47)', () => {
  it.each(flatScreens)('%s has no gradient fills', (file) => {
    expect(read(file)).not.toMatch(/bg-gradient-/)
  })

  it.each(['auth/FirstLoginSetup.tsx', 'farmer/AddFarmPage.tsx', 'farmer/FarmerDataHub.tsx', 'admin/modals/CreateUserModal.tsx'])(
    '%s uses blue, not indigo, for its actions and focus',
    (file) => {
      expect(read(file)).not.toMatch(/indigo-/)
    },
  )

  it('User Management keeps indigo only for the Head Judge role badge', () => {
    const indigoLines = read('admin/UserManagement.tsx')
      .split(/\r?\n/)
      .filter((line) => line.includes('indigo-'))
    expect(indigoLines.length).toBeGreaterThan(0)
    indigoLines.forEach((line) => expect(line).toContain('HeadJudge'))
  })

  it('User Management keeps purple only for the Admin role badge, the Admin role dot and the super admin mark', () => {
    // Transfer Ownership and the role-filter chip are an action and a filter,
    // not role colours: they use the gray / blue palette.
    const purpleLines = read('admin/UserManagement.tsx')
      .split(/\r?\n/)
      .filter((line) => line.includes('purple-'))
    expect(purpleLines.length).toBeGreaterThan(0)
    purpleLines.forEach((line) => expect(line).toMatch(/UserRole\.Admin|<Shield /))
  })

  it('Record Process, Hull & Grade and Withdraw Stock save with the blue primary button', () => {
    const workbench = read('processor/ProcessorWorkbench.tsx')
    expect(workbench).not.toMatch(/bg-indigo-600 hover:bg-indigo-700/)
    expect(workbench).not.toMatch(/focus:ring-indigo-500/)
  })

  it("the Parchment page's Withdraw Stock matches the Workbench's: blue primary, no gradient icon", () => {
    // Its popup accent says it mirrors the Workbench's Withdraw flow, which
    // is blue-600 now; the default (gray) popup icon was a gradient.
    const parchment = read('processor/ParchmentTab.tsx')
    expect(parchment).not.toMatch(/indigo-/)
    expect(parchment).not.toMatch(/bg-gradient-/)
    expect(parchment).toMatch(/button: 'bg-blue-600',\s+buttonHover: 'hover:bg-blue-700',\s+iconBlock: 'bg-blue-600'/)
  })

  it('the date picker marks the picked day without a coloured halo', () => {
    expect(read('common/DatePicker.tsx')).not.toMatch(/ring-2 ring-blue-200/)
  })
})
