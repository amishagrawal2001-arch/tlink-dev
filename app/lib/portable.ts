import * as path from 'path'
import * as fs from 'fs'
import { app } from 'electron'

const appPath = path.dirname(app.getPath('exe'))

const portableData = path.join(appPath, 'data')
if (fs.existsSync(portableData)) {
    console.log('reset user data to ' + portableData)
    app.setPath('userData', portableData)
}
