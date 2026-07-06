'use client'

import { useState, useEffect, useRef } from 'react'
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd'
import { toast } from '~/hooks/use-toast'
import { api } from '~/trpc/react'
import { Button } from '~/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card'
import { Input } from '~/components/ui/input'
import { Label } from '~/components/ui/label'
import { Textarea } from '~/components/ui/textarea'
import { Switch } from '~/components/ui/switch'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '~/components/ui/select'
import { Badge } from '~/components/ui/badge'
import { Separator } from '~/components/ui/separator'
import {
    Plus,
    GripVertical,
    Trash2,
    Edit2,
    Type,
    Mail,
    Hash,
    Calendar,
    List,
    CheckSquare,
    Circle,
    Square,
    AlignLeft,
    Paperclip,
} from 'lucide-react'
import { FORM_FIELD_TYPES } from '~/server/db/schema'

interface FormBuilderProps {
    form: {
        id: number
        title: string
        description: string | null
        fields: Array<{
            id: number
            label: string
            description: string | null
            type: string
            required: boolean
            order: number
            options: any
            validation: any
            placeholder: string | null
            defaultValue: string | null
        }>
    }
    onUpdate: () => void
    onSavingStatusChange?: (status: 'idle' | 'saving' | 'saved') => void
}

interface FieldOption {
    text: string
}

const FIELD_TYPE_ICONS = {
    text: Type,
    email: Mail,
    number: Hash,
    date: Calendar,
    select: List,
    textarea: AlignLeft,
}

const FIELD_TYPE_LABELS = {
    text: 'Text',
    email: 'Email',
    number: 'Number',
    date: 'Date',
    select: 'Dropdown',
    textarea: 'Long Text',
}

export function FormBuilder({
    form,
    onUpdate,
    onSavingStatusChange,
}: FormBuilderProps) {
    const [editingFieldId, setEditingFieldId] = useState<number | null>(null)
    const [isAddingField, setIsAddingField] = useState(false)
    const editorRef = useRef<HTMLDivElement>(null)

    // Field form state
    const [fieldForm, setFieldForm] = useState({
        label: '',
        description: '',
        type: 'text',
        required: false,
        placeholder: '',
        options: [] as FieldOption[],
        validation: {},
    })

    const containerRef = useRef<HTMLDivElement>(null)

    // Auto-scroll to field editor when it appears
    useEffect(() => {
        if ((isAddingField || editingFieldId) && editorRef.current) {
            setTimeout(() => {
                editorRef.current?.scrollIntoView({
                    behavior: 'smooth',
                    block: 'nearest',
                })
            }, 100)
        }
    }, [isAddingField, editingFieldId])

    // Mutations
    const addFieldMutation = api.forms.addField.useMutation({
        onMutate: () => {
            onSavingStatusChange?.('saving')
        },
        onSuccess: () => {
            onSavingStatusChange?.('saved')
            setTimeout(() => onSavingStatusChange?.('idle'), 2000)
            onUpdate()
            setIsAddingField(false)
            resetFieldForm()
        },
        onError: (error) => {
            onSavingStatusChange?.('idle')
            toast({
                title: 'Error adding field',
                description: error.message,
                variant: 'destructive',
            })
        },
    })

    const updateFieldMutation = api.forms.updateField.useMutation({
        onMutate: () => {
            onSavingStatusChange?.('saving')
        },
        onSuccess: () => {
            onSavingStatusChange?.('saved')
            setTimeout(() => onSavingStatusChange?.('idle'), 2000)
            onUpdate()
            setEditingFieldId(null)
            resetFieldForm()
        },
        onError: (error) => {
            onSavingStatusChange?.('idle')
            toast({
                title: 'Error updating field',
                description: error.message,
                variant: 'destructive',
            })
        },
    })

    const deleteFieldMutation = api.forms.deleteField.useMutation({
        onMutate: () => {
            onSavingStatusChange?.('saving')
        },
        onSuccess: () => {
            onSavingStatusChange?.('saved')
            setTimeout(() => onSavingStatusChange?.('idle'), 2000)
            onUpdate()
        },
        onError: (error) => {
            onSavingStatusChange?.('idle')
            toast({
                title: 'Error deleting field',
                description: error.message,
                variant: 'destructive',
            })
        },
    })

    const reorderFieldsMutation = api.forms.reorderFields.useMutation({
        onMutate: () => {
            onSavingStatusChange?.('saving')
        },
        onSuccess: () => {
            onSavingStatusChange?.('saved')
            setTimeout(() => onSavingStatusChange?.('idle'), 2000)
            onUpdate()
        },
        onError: (error) => {
            onSavingStatusChange?.('idle')
            toast({
                title: 'Error reordering fields',
                description: error.message,
                variant: 'destructive',
            })
        },
    })

    const resetFieldForm = () => {
        setFieldForm({
            label: '',
            description: '',
            type: 'text',
            required: false,
            placeholder: '',
            options: [],
            validation: {},
        })
    }

    const handleAddField = () => {
        if (!fieldForm.label.trim()) {
            toast({
                title: 'Field label is required',
                variant: 'destructive',
            })
            return
        }

        if (fieldForm.type === 'select' && fieldForm.options.length === 0) {
            toast({
                title: 'Dropdown fields must have at least one option',
                variant: 'destructive',
            })
            return
        }

        const fieldData = {
            formId: form.id,
            label: fieldForm.label,
            description: fieldForm.description || undefined,
            type: fieldForm.type as any,
            required: fieldForm.required,
            placeholder: fieldForm.placeholder || undefined,
            options:
                fieldForm.type === 'select' ? fieldForm.options : undefined,
            validation:
                Object.keys(fieldForm.validation).length > 0
                    ? fieldForm.validation
                    : undefined,
        }

        addFieldMutation.mutate(fieldData)
    }

    const handleUpdateField = () => {
        if (!editingFieldId || !fieldForm.label.trim()) return

        if (fieldForm.type === 'select' && fieldForm.options.length === 0) {
            toast({
                title: 'Dropdown fields must have at least one option',
                variant: 'destructive',
            })
            return
        }

        const fieldData = {
            fieldId: editingFieldId,
            label: fieldForm.label,
            description: fieldForm.description || undefined,
            type: fieldForm.type as any,
            required: fieldForm.required,
            placeholder: fieldForm.placeholder || undefined,
            options:
                fieldForm.type === 'select' ? fieldForm.options : undefined,
            validation:
                Object.keys(fieldForm.validation).length > 0
                    ? fieldForm.validation
                    : undefined,
        }

        updateFieldMutation.mutate(fieldData)
    }

    const handleEditField = (field: any) => {
        setEditingFieldId(field.id)
        setIsAddingField(false)
        setFieldForm({
            label: field.label,
            description: field.description ?? '',
            type: field.type,
            required: field.required,
            placeholder: field.placeholder ?? '',
            options: field.options ?? [],
            validation: field.validation ?? {},
        })
    }

    const handleAddNewField = () => {
        setIsAddingField(true)
        setEditingFieldId(null)
        resetFieldForm()
    }

    // Add effect to handle type changes
    useEffect(() => {
        if (fieldForm.type === 'select' && fieldForm.options.length === 0) {
            addOption()
        }
    }, [fieldForm.type])

    const handleCancelEdit = () => {
        setEditingFieldId(null)
        setIsAddingField(false)
        resetFieldForm()
    }

    const handleDragEnd = (result: any) => {
        if (!result.destination) return

        const items = Array.from(form.fields)
        const [reorderedItem] = items.splice(result.source.index, 1)
        items.splice(result.destination.index, 0, reorderedItem!)

        const fieldOrders = items.map((field, index) => ({
            fieldId: field.id,
            order: index,
        }))

        reorderFieldsMutation.mutate({
            formId: form.id,
            fieldOrders,
        })
    }

    const addOption = () => {
        setFieldForm((prev) => ({
            ...prev,
            options: [...prev.options, { text: '' }],
        }))
    }

    const updateOption = (index: number, value: string) => {
        setFieldForm((prev) => ({
            ...prev,
            options: prev.options.map((option, i) =>
                i === index ? { text: value } : option
            ),
        }))
    }

    const removeOption = (index: number) => {
        setFieldForm((prev) => ({
            ...prev,
            options: prev.options.filter((_, i) => i !== index),
        }))
    }

    const needsOptions = ['select'].includes(fieldForm.type)
    const showPlaceholder = !['select', 'date'].includes(fieldForm.type)

    const renderFieldEditor = () => {
        return (
            <Card
                ref={editorRef}
                className="border-dashed border-2 border-primary/50 bg-primary/5"
            >
                <CardHeader>
                    <CardTitle className="text-lg">
                        {editingFieldId ? 'Edit Field' : 'Add New Field'}
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid gap-4 md:grid-cols-2">
                        <div className="space-y-2">
                            <Label htmlFor="field-label">Label *</Label>
                            <Input
                                id="field-label"
                                value={fieldForm.label}
                                onChange={(e) =>
                                    setFieldForm((prev) => ({
                                        ...prev,
                                        label: e.target.value,
                                    }))
                                }
                                placeholder="Enter field label"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="field-type">Type</Label>
                            <Select
                                value={fieldForm.type}
                                onValueChange={(value: string) =>
                                    setFieldForm((prev) => ({
                                        ...prev,
                                        type: value,
                                        // Reset options when changing type
                                        options:
                                            value === 'select'
                                                ? [{ text: '' }]
                                                : [],
                                    }))
                                }
                            >
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {FORM_FIELD_TYPES.map((type) => (
                                        <SelectItem key={type} value={type}>
                                            {
                                                FIELD_TYPE_LABELS[
                                                    type
                                                ]
                                            }
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="field-description">Description</Label>
                        <Input
                            id="field-description"
                            value={fieldForm.description}
                            onChange={(e) =>
                                setFieldForm((prev) => ({
                                    ...prev,
                                    description: e.target.value,
                                }))
                            }
                            placeholder="Optional description or help text"
                        />
                    </div>

                    {showPlaceholder && (
                        <div className="space-y-2">
                            <Label htmlFor="field-placeholder">
                                Placeholder
                            </Label>
                            <Input
                                id="field-placeholder"
                                value={fieldForm.placeholder}
                                onChange={(e) =>
                                    setFieldForm((prev) => ({
                                        ...prev,
                                        placeholder: e.target.value,
                                    }))
                                }
                                placeholder="Placeholder text"
                            />
                        </div>
                    )}

                    <div className="flex items-center space-x-2">
                        <Switch
                            id="field-required"
                            checked={fieldForm.required}
                            onCheckedChange={(checked: boolean) =>
                                setFieldForm((prev) => ({
                                    ...prev,
                                    required: checked,
                                }))
                            }
                        />
                        <Label htmlFor="field-required">Required field</Label>
                    </div>

                    {needsOptions && (
                        <div className="space-y-3">
                            <div className="flex items-center justify-between">
                                <Label>Options</Label>
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={addOption}
                                >
                                    <Plus size={14} className="mr-1" />
                                    Add Option
                                </Button>
                            </div>
                            <div className="space-y-2">
                                {fieldForm.options.map((option, index) => (
                                    <div
                                        key={index}
                                        className="flex items-center gap-2"
                                    >
                                        <Input
                                            placeholder="Option"
                                            value={option.text}
                                            onChange={(e) =>
                                                updateOption(
                                                    index,
                                                    e.target.value
                                                )
                                            }
                                        />
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => removeOption(index)}
                                        >
                                            <Trash2 size={14} />
                                        </Button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    <div className="flex items-center gap-2 pt-4">
                        <Button
                            onClick={
                                editingFieldId
                                    ? handleUpdateField
                                    : handleAddField
                            }
                            disabled={!fieldForm.label.trim()}
                        >
                            {editingFieldId ? 'Update Field' : 'Add Field'}
                        </Button>
                        <Button variant="outline" onClick={handleCancelEdit}>
                            Cancel
                        </Button>
                    </div>
                </CardContent>
            </Card>
        )
    }

    // Auto-scroll to editor when adding or editing a field
    useEffect(() => {
        if (isAddingField || editingFieldId) {
            const container = containerRef.current
            if (container) {
                container.scrollIntoView({ behavior: 'smooth' })
            }
        }
    }, [isAddingField, editingFieldId])

    return (
        <div className="space-y-6 min-h-0" ref={containerRef}>
            <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">Form Fields</h2>
                {!isAddingField && !editingFieldId && (
                    <Button onClick={handleAddNewField}>
                        <Plus size={16} className="mr-2" />
                        Add Field
                    </Button>
                )}
            </div>

            {form.fields.length === 0 && !isAddingField ? (
                <Card>
                    <CardContent className="flex h-32 items-center justify-center">
                        <div className="text-center">
                            <p className="text-muted-foreground">
                                No fields added yet
                            </p>
                            <Button
                                variant="outline"
                                className="mt-2"
                                onClick={handleAddNewField}
                            >
                                Add your first field
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            ) : (
                <DragDropContext onDragEnd={handleDragEnd}>
                    <Droppable droppableId="fields">
                        {(provided) => (
                            <div
                                {...provided.droppableProps}
                                ref={provided.innerRef}
                                className="space-y-4"
                            >
                                {form.fields.map((field, index) => {
                                    const IconComponent =
                                        FIELD_TYPE_ICONS[
                                            field.type as keyof typeof FIELD_TYPE_ICONS
                                        ] || Type
                                    const isEditing =
                                        editingFieldId === field.id

                                    return (
                                        <div key={field.id}>
                                            {!isEditing ? (
                                                <Draggable
                                                    draggableId={field.id.toString()}
                                                    index={index}
                                                >
                                                    {(provided) => (
                                                        <Card
                                                            ref={
                                                                provided.innerRef
                                                            }
                                                            {...provided.draggableProps}
                                                            className="relative hover:shadow-md transition-shadow"
                                                        >
                                                            <CardHeader className="pb-3">
                                                                <div className="flex items-center justify-between">
                                                                    <div className="flex items-center gap-3">
                                                                        <div
                                                                            {...provided.dragHandleProps}
                                                                            className="cursor-grab text-muted-foreground hover:text-foreground"
                                                                        >
                                                                            <GripVertical
                                                                                size={
                                                                                    16
                                                                                }
                                                                            />
                                                                        </div>
                                                                        <IconComponent
                                                                            size={
                                                                                16
                                                                            }
                                                                            className="text-muted-foreground"
                                                                        />
                                                                        <div>
                                                                            <div className="flex items-center gap-2">
                                                                                <h3 className="font-medium">
                                                                                    {
                                                                                        field.label
                                                                                    }
                                                                                </h3>
                                                                                {field.required && (
                                                                                    <Badge
                                                                                        variant="secondary"
                                                                                        className="text-xs"
                                                                                    >
                                                                                        Required
                                                                                    </Badge>
                                                                                )}
                                                                            </div>
                                                                            <p className="text-sm text-muted-foreground">
                                                                                {
                                                                                    FIELD_TYPE_LABELS[
                                                                                        field.type as keyof typeof FIELD_TYPE_LABELS
                                                                                    ]
                                                                                }
                                                                                {field.description &&
                                                                                    ` • ${field.description}`}
                                                                            </p>
                                                                        </div>
                                                                    </div>
                                                                    <div className="flex items-center gap-2">
                                                                        <Button
                                                                            variant="ghost"
                                                                            size="sm"
                                                                            onClick={() =>
                                                                                handleEditField(
                                                                                    field
                                                                                )
                                                                            }
                                                                        >
                                                                            <Edit2
                                                                                size={
                                                                                    14
                                                                                }
                                                                            />
                                                                        </Button>
                                                                        <Button
                                                                            variant="ghost"
                                                                            size="sm"
                                                                            onClick={() =>
                                                                                deleteFieldMutation.mutate(
                                                                                    {
                                                                                        fieldId:
                                                                                            field.id,
                                                                                    }
                                                                                )
                                                                            }
                                                                        >
                                                                            <Trash2
                                                                                size={
                                                                                    14
                                                                                }
                                                                            />
                                                                        </Button>
                                                                    </div>
                                                                </div>
                                                            </CardHeader>
                                                        </Card>
                                                    )}
                                                </Draggable>
                                            ) : (
                                                renderFieldEditor()
                                            )}
                                        </div>
                                    )
                                })}
                                {provided.placeholder}

                                {/* Add field editor at the bottom */}
                                {isAddingField && renderFieldEditor()}

                                {/* Add field button when not adding/editing */}
                                {!isAddingField &&
                                    !editingFieldId &&
                                    form.fields.length > 0 && (
                                        <div className="flex justify-center pt-4">
                                            <Button
                                                variant="outline"
                                                onClick={handleAddNewField}
                                                className="border-dashed border-2 w-full max-w-sm h-16 text-muted-foreground hover:text-foreground hover:border-solid"
                                            >
                                                <Plus
                                                    size={20}
                                                    className="mr-2"
                                                />
                                                Add Field
                                            </Button>
                                        </div>
                                    )}
                            </div>
                        )}
                    </Droppable>
                </DragDropContext>
            )}
        </div>
    )
}
