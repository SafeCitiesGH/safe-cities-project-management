'use client'

import { useParams } from 'next/navigation'
import { useState } from 'react'
import { toast } from '~/hooks/use-toast'
import { FileHeader } from '~/components/file-header'
import { FormBuilder } from '~/components/form-builder'
import { FormPreview } from '~/components/form-preview'
import { FormSettings } from '~/components/form-settings'
import { api } from '~/trpc/react'
import { Button } from '~/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '~/components/ui/tabs'
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from '~/components/ui/card'
import { Badge } from '~/components/ui/badge'
import {
    Eye,
    Edit,
    Settings,
    BarChart3,
    Download,
    ChevronDown,
    ExternalLink,
} from 'lucide-react'
import { SubmissionDetails } from '~/components/submission-details'
import {
    Collapsible,
    CollapsibleContent,
    CollapsibleTrigger,
} from '~/components/ui/collapsible'

type Permission = 'view' | 'comment' | 'edit'

export default function FormView() {
    const params = useParams()
    const formId = Number(params.formId)
    const [activeTab, setActiveTab] = useState('builder')
    const [savingStatus, setSavingStatus] = useState<
        'idle' | 'saving' | 'saved'
    >('idle')

    const {
        data: formData,
        isLoading,
        error,
        refetch,
    } = api.forms.getByFileIdProtected.useQuery(
        { fileId: formId },
        {
            enabled: !!formId && !isNaN(formId),
            retry: (failureCount, error) => {
                // Don't retry on permission or type validation errors
                if (
                    error?.data?.code === 'FORBIDDEN' ||
                    error?.data?.code === 'BAD_REQUEST'
                ) {
                    return false
                }
                return failureCount < 3
            },
        }
    )

    const { data: userPermission } = api.permissions.getUserPermission.useQuery(
        { fileId: formData?.file.id || 0 },
        { enabled: !!formData?.file.id }
    )

    const { data: stats } = api.forms.getStatistics.useQuery(
        { formId: formData?.fileId || 0 },
        { enabled: !!formData?.fileId && activeTab === 'analytics' }
    )

    const { data: submissions } = api.forms.getSubmissions.useQuery(
        { formId: formData?.fileId || 0 },
        { enabled: !!formData?.fileId && activeTab === 'analytics' }
    )

    if (isLoading) {
        return (
            <div className="flex h-screen items-center justify-center">
                <div className="flex flex-col items-center justify-center">
                    <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent"></div>
                    <p className="mt-4 text-sm text-muted-foreground">
                        Loading form content...
                    </p>
                </div>
            </div>
        )
    }

    if (error || !formData) {
        return (
            <div className="flex h-screen items-center justify-center">
                <div className="text-center">
                    <p className="text-lg font-semibold text-destructive">
                        Error loading form
                    </p>
                    <p className="text-sm text-muted-foreground">
                        {error?.message || 'Form not found'}
                    </p>
                </div>
            </div>
        )
    }

    const canEdit = userPermission === 'edit'

    const getFormUrl = () => {
        return `${window.location.origin}/forms/${formData.fileId}/submit`
    }

    const openFormInNewTab = () => {
        window.open(getFormUrl(), '_blank')
    }

    return (
        <div className="flex h-screen flex-col">
            <FileHeader
                filename={formData.file.name}
                fileId={formData.file.id}
                permission={userPermission!}
                savingStatus={savingStatus}
            />

            <div className="flex-1 flex flex-col overflow-auto">
                {/* Fixed header section with form title and tabs */}
                <div className="flex-none border-b bg-background p-6 pb-0">
                    <div className="mb-6 flex items-center justify-between">
                        <div>
                            <h1 className="text-2xl font-bold">
                                {formData.title}
                            </h1>
                            {formData.description && (
                                <p className="mt-1 text-muted-foreground">
                                    {formData.description}
                                </p>
                            )}
                            <div className="mt-2 flex items-center gap-2">
                                <Badge
                                    variant={
                                        formData.isPublished
                                            ? 'default'
                                            : 'secondary'
                                    }
                                >
                                    {formData.isPublished
                                        ? 'Published'
                                        : 'Draft'}
                                </Badge>
                                <Badge
                                    variant={
                                        formData.acceptingResponses
                                            ? 'default'
                                            : 'destructive'
                                    }
                                >
                                    {formData.acceptingResponses
                                        ? 'Accepting Responses'
                                        : 'Closed'}
                                </Badge>
                                {stats && (
                                    <Badge variant="outline">
                                        {stats.totalSubmissions} responses
                                    </Badge>
                                )}
                            </div>
                        </div>
                        <div>
                            <Button
                                variant="outline"
                                onClick={openFormInNewTab}
                                className="flex items-center gap-2"
                            >
                                <ExternalLink className="h-4 w-4" />
                                Go to Form
                            </Button>
                        </div>
                    </div>

                    <Tabs
                        value={activeTab}
                        onValueChange={setActiveTab}
                        className="flex flex-col h-full"
                    >
                        <TabsList className="grid w-full grid-cols-4">
                            <TabsTrigger
                                value="builder"
                                className="flex items-center gap-2"
                            >
                                <Edit size={16} />
                                Builder
                            </TabsTrigger>
                            <TabsTrigger
                                value="preview"
                                className="flex items-center gap-2"
                            >
                                <Eye size={16} />
                                Preview
                            </TabsTrigger>
                            <TabsTrigger
                                value="analytics"
                                className="flex items-center gap-2"
                            >
                                <BarChart3 size={16} />
                                Analytics
                            </TabsTrigger>
                            <TabsTrigger
                                value="settings"
                                className="flex items-center gap-2"
                            >
                                <Settings size={16} />
                                Settings
                            </TabsTrigger>
                        </TabsList>

                        {/* Scrollable content area */}
                        <div className="flex-1 overflow-hidden">
                            <div className="h-full overflow-y-auto">
                                <TabsContent
                                    value="builder"
                                    className="mt-0 p-6 pb-12"
                                >
                                    {canEdit ? (
                                        <FormBuilder
                                            form={{
                                                ...formData,
                                                id: formData.fileId, // Use fileId as id for compatibility
                                                fields: formData.fields.map(
                                                    (field) => ({
                                                        ...field,
                                                        required:
                                                            field.required ??
                                                            false,
                                                        order: field.order ?? 0,
                                                    })
                                                ),
                                            }}
                                            onUpdate={() => refetch()}
                                            onSavingStatusChange={
                                                setSavingStatus
                                            }
                                        />
                                    ) : (
                                        <div className="flex h-64 items-center justify-center">
                                            <p className="text-muted-foreground">
                                                You don't have permission to
                                                edit this form
                                            </p>
                                        </div>
                                    )}
                                </TabsContent>

                                <TabsContent
                                    value="preview"
                                    className="mt-0 p-6 pb-12"
                                >
                                    <FormPreview
                                        form={{
                                            id: formData.fileId,
                                            title: formData.title,
                                            description: formData.description,
                                            showProgressBar:
                                                formData.showProgressBar ??
                                                false,
                                            fields: formData.fields.map(
                                                (field) => ({
                                                    id: field.id,
                                                    label: field.label,
                                                    description:
                                                        field.description,
                                                    type: field.type,
                                                    required:
                                                        field.required ?? false,
                                                    order: field.order ?? 0,
                                                    options: field.options,
                                                    validation:
                                                        field.validation,
                                                    placeholder:
                                                        field.placeholder,
                                                    defaultValue:
                                                        field.defaultValue,
                                                })
                                            ),
                                        }}
                                    />
                                </TabsContent>

                                <TabsContent
                                    value="analytics"
                                    className="mt-0 space-y-6 p-6 pb-12"
                                >
                                    <div className="grid gap-6 md:grid-cols-3">
                                        <Card>
                                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                                <CardTitle className="text-sm font-medium">
                                                    Total Responses
                                                </CardTitle>
                                            </CardHeader>
                                            <CardContent>
                                                <div className="text-2xl font-bold">
                                                    {stats?.totalSubmissions ||
                                                        0}
                                                </div>
                                            </CardContent>
                                        </Card>
                                        <Card>
                                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                                <CardTitle className="text-sm font-medium">
                                                    Form Fields
                                                </CardTitle>
                                            </CardHeader>
                                            <CardContent>
                                                <div className="text-2xl font-bold">
                                                    {formData.fields.length}
                                                </div>
                                            </CardContent>
                                        </Card>
                                        <Card>
                                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                                <CardTitle className="text-sm font-medium">
                                                    Completion Rate
                                                </CardTitle>
                                            </CardHeader>
                                            <CardContent>
                                                <div className="text-2xl font-bold">
                                                    {formData.fields.length > 0
                                                        ? '100%'
                                                        : '0%'}
                                                </div>
                                            </CardContent>
                                        </Card>
                                    </div>

                                    {/* Submissions */}
                                    {submissions && submissions.length > 0 && (
                                        <Card>
                                            <CardHeader>
                                                <CardTitle>
                                                    Recent Submissions
                                                </CardTitle>
                                            </CardHeader>
                                            <CardContent>
                                                <div className="space-y-4">
                                                    {submissions
                                                        .slice(0, 5)
                                                        .map((submission) => (
                                                            <Collapsible
                                                                key={
                                                                    submission.id
                                                                }
                                                            >
                                                                <CollapsibleTrigger className="w-full">
                                                                    <div className="flex items-center justify-between border-b pb-2">
                                                                        <div>
                                                                            <p className="font-medium">
                                                                                {(() => {
                                                                                    // Find name from form responses
                                                                                    const nameResponse =
                                                                                        submission.responses.find(
                                                                                            (
                                                                                                r
                                                                                            ) =>
                                                                                                r.field.label.toLowerCase() ===
                                                                                                'name'
                                                                                        )
                                                                                    return (
                                                                                        nameResponse?.value ||
                                                                                        'Anonymous'
                                                                                    )
                                                                                })()}
                                                                            </p>
                                                                            <p className="text-sm text-muted-foreground">
                                                                                {new Date(
                                                                                    submission.createdAt
                                                                                ).toLocaleString()}
                                                                            </p>
                                                                        </div>
                                                                    </div>
                                                                </CollapsibleTrigger>
                                                                <CollapsibleContent>
                                                                    <div className="pt-4">
                                                                        <SubmissionDetails
                                                                            submission={
                                                                                submission
                                                                            }
                                                                        />
                                                                    </div>
                                                                </CollapsibleContent>
                                                            </Collapsible>
                                                        ))}
                                                </div>
                                            </CardContent>
                                        </Card>
                                    )}
                                </TabsContent>

                                <TabsContent
                                    value="settings"
                                    className="mt-0 p-6 pb-12"
                                >
                                    {canEdit ? (
                                        <FormSettings
                                            form={{
                                                ...formData,
                                                id: formData.fileId, // Use fileId as id for compatibility
                                                isPublished:
                                                    formData.isPublished ??
                                                    false,
                                                acceptingResponses:
                                                    formData.acceptingResponses ??
                                                    false,
                                                showProgressBar:
                                                    formData.showProgressBar ??
                                                    false,
                                                allowAnonymous:
                                                    formData.allowAnonymous ??
                                                    false,
                                                requireLogin:
                                                    formData.requireLogin ??
                                                    false,
                                                oneResponsePerUser:
                                                    formData.oneResponsePerUser ??
                                                    false,
                                                file: {
                                                    id: formData.file.id,
                                                    name: formData.file.name,
                                                },
                                            }}
                                            onUpdate={() => refetch()}
                                            onSavingStatusChange={
                                                setSavingStatus
                                            }
                                        />
                                    ) : (
                                        <div className="flex h-full items-center justify-center">
                                            <p className="text-muted-foreground">
                                                You don't have permission to
                                                modify settings
                                            </p>
                                        </div>
                                    )}
                                </TabsContent>
                            </div>
                        </div>
                    </Tabs>
                </div>
            </div>
        </div>
    )
}
