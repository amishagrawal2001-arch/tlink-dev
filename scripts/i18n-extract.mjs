#!/usr/bin/env node
import sh from 'shelljs'
import fs from 'node:fs/promises'
import * as path from 'path'
import * as vars from './vars.mjs'
import log from 'npmlog'
import { GettextExtractor, JsExtractors, HtmlExtractors } from 'gettext-extractor'

let extractor = new GettextExtractor()

const tempOutput = 'locale/app.new.pot'
const pot = 'locale/app.pot'
const tempHtml = 'locale/tmp-html'

;(async () => {
    sh.mkdir('-p', tempHtml)
    for (const plugin of vars.builtinPlugins) {
        log.info('compile-pug', plugin)

        // Compile Pug files to HTML (may fail if no Pug files, which is OK)
        sh.exec(`yarn pug --doctype html -s --pretty -O '{require: function(){}}' -o ${tempHtml}/${plugin} ${plugin}`, { silent: true })

        // Copy HTML files directly for plugins that use HTML templates
        const htmlFiles = sh.find(`${plugin}/src`).filter(file => file.match(/\.html$/))
        if (htmlFiles.length > 0) {
            sh.mkdir('-p', `${tempHtml}/${plugin}/src`)
            htmlFiles.forEach(file => {
                const relativePath = file.replace(`${plugin}/`, '')
                sh.mkdir('-p', `${tempHtml}/${plugin}/${path.dirname(relativePath)}`)
                sh.cp(file, `${tempHtml}/${plugin}/${relativePath}`)
            })
        }
    }

    log.info('extract-ts')
    extractor.createJsParser([
        JsExtractors.callExpression('this.translate.instant', {
            arguments: { text: 0 },
        }),
        JsExtractors.callExpression('translate.instant', {
            arguments: { text: 0 },
        }),
        JsExtractors.callExpression('_', {
            arguments: { text: 0 },
        }),
    ]).parseFilesGlob('./tlink-*/src/**/*.ts')

    log.info('extract-html')
    const options = {
        attributes: {
            context: 'translatecontext',
        },
    }
    extractor.createHtmlParser([
        HtmlExtractors.elementContent('translate, [translate=""]', options),
        HtmlExtractors.elementAttribute('[translate*=" "]', 'translate', options),
    ]).parseFilesGlob(`${tempHtml}/**/*.html`)

    extractor.savePotFile(tempOutput)
    extractor.printStats()

    sh.rm('-r', tempHtml)
    sh.exec(`msgcat -s ${tempOutput} > ${pot}`, { fatal: true })

    await fs.rename(tempOutput, pot)
})()
