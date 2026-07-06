'use client'

import { saveBlob } from './save-blob'

export interface FormFieldExport {
    label: string
    description?: string | null
    type: string
    required?: boolean | null
    options?: Array<{ text: string } | string> | null
}

/**
 * Downloads the form's questions as a CSV (question, description, type,
 * required, options). Google Forms has no direct import format, so this gives
 * a clean copy of every question to rebuild the form there or anywhere else.
 */
export function exportFormQuestions(
    fields: FormFieldExport[],
    fileName: string
) {
    const escape = (value: string) => `"${value.replace(/"/g, '""')}"`

    const rows = [
        ['Question', 'Description', 'Type', 'Required', 'Options'],
        ...fields.map((field) => [
            field.label,
            field.description ?? '',
            field.type,
            field.required ? 'Yes' : 'No',
            (field.options ?? [])
                .map((option) =>
                    typeof option === 'string' ? option : option.text
                )
                .join('; '),
        ]),
    ]

    const csv = rows
        .map((row) => row.map((cell) => escape(String(cell))).join(','))
        .join('\r\n')

    // BOM so Excel opens the file as UTF-8.
    saveBlob(
        new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }),
        fileName
    )
}
