'use client'

import * as React from 'react'
import { EditorContent, EditorContext, useEditor } from '@tiptap/react'

// --- Tiptap Core Extensions ---
import { StarterKit } from '@tiptap/starter-kit'
import { Collaboration, isChangeOrigin } from '@tiptap/extension-collaboration'
import { TaskList } from '@tiptap/extension-task-list'
import { TextAlign } from '@tiptap/extension-text-align'
import { Typography } from '@tiptap/extension-typography'
import { Highlight } from '@tiptap/extension-highlight'
import { Subscript } from '@tiptap/extension-subscript'
import { Superscript } from '@tiptap/extension-superscript'
import { Underline } from '@tiptap/extension-underline'

// --- Custom Extensions ---
import { Link } from '@/components/tiptap-extension/link-extension'
import { Selection } from '@/components/tiptap-extension/selection-extension'
import { TrailingNode } from '@/components/tiptap-extension/trailing-node-extension'
import { AssignableTaskItem } from '~/components/tiptap-extension/assignable-task-item-extension'
import { ResizableImage } from '~/components/tiptap-extension/resizable-image-extension'

import UniqueId from 'tiptap-unique-id'

// --- UI Primitives ---
import { Button } from '@/components/tiptap-ui-primitive/button'
import { Spacer } from '@/components/tiptap-ui-primitive/spacer'
import {
    Toolbar,
    ToolbarGroup,
    ToolbarSeparator,
} from '@/components/tiptap-ui-primitive/toolbar'

// --- Tiptap Node ---
import { ImageUploadNode } from '@/components/tiptap-node/image-upload-node/image-upload-node-extension'
import '@/components/tiptap-node/code-block-node/code-block-node.scss'
import '@/components/tiptap-node/list-node/list-node.scss'
import '@/components/tiptap-node/image-node/image-node.scss'
import '@/components/tiptap-node/paragraph-node/paragraph-node.scss'
import '~/components/tiptap-node/task-item-node/assignable-task-item.scss'

// --- Tiptap UI ---
import { HeadingDropdownMenu } from '@/components/tiptap-ui/heading-dropdown-menu'
import { ImageUploadButton } from '@/components/tiptap-ui/image-upload-button'
import { ListDropdownMenu } from '@/components/tiptap-ui/list-dropdown-menu'
import { BlockQuoteButton } from '@/components/tiptap-ui/blockquote-button'
import { CodeBlockButton } from '@/components/tiptap-ui/code-block-button'
import {
    ColorHighlightPopover,
    ColorHighlightPopoverContent,
    ColorHighlightPopoverButton,
} from '@/components/tiptap-ui/color-highlight-popover'
import {
    LinkPopover,
    LinkContent,
    LinkButton,
} from '@/components/tiptap-ui/link-popover'
import { MarkButton } from '@/components/tiptap-ui/mark-button'
import { TextAlignButton } from '@/components/tiptap-ui/text-align-button'
import { UndoRedoButton } from '@/components/tiptap-ui/undo-redo-button'

// --- Icons ---
import { ArrowLeftIcon } from '@/components/tiptap-icons/arrow-left-icon'
import { HighlighterIcon } from '@/components/tiptap-icons/highlighter-icon'
import { LinkIcon } from '@/components/tiptap-icons/link-icon'

// --- Hooks ---
import { useMobile } from '~/hooks/use-mobile'
import { useWindowSize } from '~/hooks/use-window-size'
import { useCursorVisibility } from '~/hooks/use-cursor-visibility'
import { useYjsCollaboration } from '~/hooks/use-yjs-collaboration'

// --- Components ---
import { ThemeToggle } from '~/components/tiptap-templates/simple/theme-toggle'

// --- Lib ---
import { handleImageUpload, MAX_FILE_SIZE } from '~/lib/tiptap-utils'

// --- Styles ---
import '~/components/tiptap-templates/simple/simple-editor.scss'

import content from '~/components/tiptap-templates/simple/data/content.json'
import { ListButton } from '@/components/tiptap-ui/list-button'

const MainToolbarContent = ({
    onHighlighterClick,
    onLinkClick,
    isMobile,
}: {
    onHighlighterClick: () => void
    onLinkClick: () => void
    isMobile: boolean
}) => {
    const { editor } = React.useContext(EditorContext)
    return (
        <>
            <Spacer />

            <ToolbarGroup>
                <UndoRedoButton action="undo" />
                <UndoRedoButton action="redo" />
            </ToolbarGroup>

            <ToolbarSeparator />

            <ToolbarGroup>
                <HeadingDropdownMenu levels={[1, 2, 3, 4]} />
                <ListDropdownMenu types={['bulletList', 'orderedList']} />
                {/* <BlockQuoteButton />*/}
                <ListButton type="taskList" />
                {/* <CodeBlockButton />*/}
            </ToolbarGroup>

            <ToolbarSeparator />

            <ToolbarGroup>
                <MarkButton type="bold" />
                <MarkButton type="italic" />
                {/* <MarkButton type="strike" /> */}
                {/* <MarkButton type="code" />  */}
                <MarkButton type="underline" />
                {/* {!isMobile ? (
          <ColorHighlightPopover />
        ) : (
          <ColorHighlightPopoverButton onClick={onHighlighterClick} />
        )} */}
                {!isMobile ? (
                    <LinkPopover />
                ) : (
                    <LinkButton onClick={onLinkClick} />
                )}
            </ToolbarGroup>

            <ToolbarSeparator />

            <ToolbarGroup>
                <MarkButton type="superscript" />
                <MarkButton type="subscript" />
            </ToolbarGroup>

            <ToolbarSeparator />

            <ToolbarGroup>
                <TextAlignButton align="left" />
                <TextAlignButton align="center" />
                <TextAlignButton align="right" />
                <TextAlignButton align="justify" />
            </ToolbarGroup>

            <ToolbarSeparator />

            <ToolbarGroup>
                <ImageUploadButton text="Add" />
            </ToolbarGroup>

            <Spacer />

            {isMobile && <ToolbarSeparator />}

            {/* Moved this to sidebar
      <ToolbarGroup>
        <ThemeToggle />
      </ToolbarGroup> */}
        </>
    )
}

const MobileToolbarContent = ({
    type,
    onBack,
}: {
    type: 'highlighter' | 'link'
    onBack: () => void
}) => (
    <>
        <ToolbarGroup>
            <Button data-style="ghost" onClick={onBack}>
                <ArrowLeftIcon className="tiptap-button-icon" />
                {type === 'highlighter' ? (
                    <HighlighterIcon className="tiptap-button-icon" />
                ) : (
                    <LinkIcon className="tiptap-button-icon" />
                )}
            </Button>
        </ToolbarGroup>

        <ToolbarSeparator />

        {type === 'highlighter' ? (
            <ColorHighlightPopoverContent />
        ) : (
            <LinkContent />
        )}
    </>
)

type RemoteCaret = {
    clientId: string
    name: string
    permission: 'view' | 'comment' | 'edit'
    color: string
    left: number
    top: number
    height: number
}

function getPermissionLabel(permission: 'view' | 'comment' | 'edit') {
    if (permission === 'edit') return 'editor'
    if (permission === 'comment') return 'commenter'
    return 'viewer'
}

interface SimpleEditorProps {
    initialContent?: string
    readOnly?: boolean
    onUpdate?: (content: string) => void
    realtimeDocumentId?: string | number
    permission?: 'view' | 'comment' | 'edit'
}

export function SimpleEditor({
    initialContent,
    readOnly = false,
    onUpdate,
    realtimeDocumentId,
    permission = 'view',
}: SimpleEditorProps) {
    const isMobile = useMobile()
    const windowSize = useWindowSize()
    const [mobileView, setMobileView] = React.useState<
        'main' | 'highlighter' | 'link'
    >('main')
    const toolbarRef = React.useRef<HTMLDivElement>(null)
    const contentWrapperRef = React.useRef<HTMLDivElement>(null)
    const [remoteCarets, setRemoteCarets] = React.useState<RemoteCaret[]>([])
    const collaborationEnabled = Boolean(realtimeDocumentId)
    const collaboration = useYjsCollaboration({
        documentId: realtimeDocumentId,
        enabled: collaborationEnabled,
        permission,
    })
    const {
        clientId,
        lastError: collaborationLastError,
        markInitialContentLoaded,
        presenceUsers,
        shouldLoadInitialContent,
        status: collaborationStatus,
        updatePresenceMetadata,
        ydoc,
    } = collaboration

    const editor = useEditor({
        immediatelyRender: false,
        editable: !readOnly,
        editorProps: {
            attributes: {
                autocomplete: 'off',
                autocorrect: 'off',
                autocapitalize: 'off',
                'aria-label': 'Main content area, start typing to enter text.',
            },
        },
        extensions: [
            collaborationEnabled
                ? StarterKit.configure({ history: false })
                : StarterKit,
            ...(collaborationEnabled
                ? [
                      Collaboration.configure({
                          document: ydoc,
                      }),
                  ]
                : []),
            TextAlign.configure({ types: ['heading', 'paragraph'] }),
            Underline,
            TaskList,
            AssignableTaskItem,
            Highlight.configure({ multicolor: true }),
            ResizableImage,
            Typography,
            Superscript,
            Subscript,
            ...(collaborationEnabled
                ? []
                : [
                      UniqueId.configure({
                          attributeName: 'id',
                          types: [
                              'paragraph',
                              'heading',
                              'orderedList',
                              'bulletList',
                              'listItem',
                          ],
                          createId: () => window.crypto.randomUUID(),
                      }),
                  ]),

            Selection,
            ImageUploadNode.configure({
                accept: 'image/*',
                maxSize: MAX_FILE_SIZE,
                limit: 3,
                upload: handleImageUpload,
                onError: (error) => console.error('Upload failed:', error),
            }),
            TrailingNode,
            Link.configure({ openOnClick: false }),
        ],
        content: collaborationEnabled ? undefined : initialContent || content,
    })

    const bodyRect = useCursorVisibility({
        editor,
        overlayHeight: toolbarRef.current?.getBoundingClientRect().height ?? 0,
    })

    React.useEffect(() => {
        if (!collaborationEnabled || !editor || readOnly) return

        const publishSelection = () => {
            const { anchor, head } = editor.state.selection
            updatePresenceMetadata({
                selection: {
                    anchor,
                    head,
                },
            })
        }

        publishSelection()
        editor.on('selectionUpdate', publishSelection)
        editor.on('focus', publishSelection)

        return () => {
            editor.off('selectionUpdate', publishSelection)
            editor.off('focus', publishSelection)
        }
    }, [collaborationEnabled, editor, readOnly, updatePresenceMetadata])

    React.useEffect(() => {
        if (!collaborationEnabled || !editor) {
            setRemoteCarets([])
            return
        }

        const updateRemoteCarets = () => {
            const wrapper = contentWrapperRef.current
            if (!wrapper) return

            const wrapperRect = wrapper.getBoundingClientRect()
            const docSize = editor.state.doc.content.size
            const nextCarets = presenceUsers
                .filter(
                    (presenceUser) =>
                        presenceUser.clientId !== clientId &&
                        presenceUser.permission !== 'view' &&
                        presenceUser.selection
                )
                .flatMap((presenceUser) => {
                    try {
                        const selectionHead = Math.max(
                            0,
                            Math.min(
                                presenceUser.selection?.head ?? 0,
                                docSize
                            )
                        )
                        const coords = editor.view.coordsAtPos(selectionHead)

                        return [
                            {
                                clientId: presenceUser.clientId,
                                name: presenceUser.name,
                                permission: presenceUser.permission,
                                color: presenceUser.color,
                                left:
                                    coords.left -
                                    wrapperRect.left +
                                    wrapper.scrollLeft,
                                top:
                                    coords.top -
                                    wrapperRect.top +
                                    wrapper.scrollTop,
                                height: Math.max(
                                    16,
                                    coords.bottom - coords.top
                                ),
                            },
                        ]
                    } catch {
                        return []
                    }
                })

            setRemoteCarets(nextCarets)
        }

        updateRemoteCarets()

        const wrapper = contentWrapperRef.current
        wrapper?.addEventListener('scroll', updateRemoteCarets)
        window.addEventListener('resize', updateRemoteCarets)

        return () => {
            wrapper?.removeEventListener('scroll', updateRemoteCarets)
            window.removeEventListener('resize', updateRemoteCarets)
        }
    }, [clientId, collaborationEnabled, editor, presenceUsers])

    // Add effect to handle content updates
    React.useEffect(() => {
        if (!editor || !onUpdate) return

        const handleUpdate = ({
            transaction,
        }: {
            transaction: Parameters<typeof isChangeOrigin>[0]
        }) => {
            if (collaborationEnabled && isChangeOrigin(transaction)) return

            const htmlContent = editor.getHTML()
            onUpdate(htmlContent)
        }

        editor.on('update', handleUpdate)

        return () => {
            editor.off('update', handleUpdate)
        }
    }, [collaborationEnabled, editor, onUpdate])

    // Handle initialContent changes from parent
    React.useEffect(() => {
        if (collaborationEnabled) return

        if (editor && initialContent && editor.getHTML() !== initialContent) {
            editor.commands.setContent(initialContent)
        }
    }, [collaborationEnabled, editor, initialContent])

    React.useEffect(() => {
        if (!collaborationEnabled || !editor || !shouldLoadInitialContent) {
            return
        }

        const contentToLoad =
            initialContent && initialContent.trim() !== ''
                ? initialContent
                : '<p></p>'

        editor.commands.setContent(contentToLoad)
        markInitialContentLoaded()
    }, [
        collaborationEnabled,
        editor,
        initialContent,
        markInitialContentLoaded,
        shouldLoadInitialContent,
    ])

    // Handle readOnly prop changes
    React.useEffect(() => {
        if (editor) {
            editor.setEditable(!readOnly)
        }
    }, [editor, readOnly])

    React.useEffect(() => {
        if (!isMobile && mobileView !== 'main') {
            setMobileView('main')
        }
    }, [isMobile, mobileView])

    return (
        <EditorContext.Provider value={{ editor }}>
            <div className="simple-editor-container">
                <Toolbar
                    ref={toolbarRef}
                    style={{
                        position: 'sticky',
                        top: 0,
                        zIndex: 10,
                        ...(isMobile
                            ? {
                                  bottom: `calc(100% - ${windowSize.height - bodyRect.y}px)`,
                              }
                            : {}),
                    }}
                >
                    {mobileView === 'main' ? (
                        <MainToolbarContent
                            onHighlighterClick={() =>
                                setMobileView('highlighter')
                            }
                            onLinkClick={() => setMobileView('link')}
                            isMobile={isMobile}
                        />
                    ) : (
                        <MobileToolbarContent
                            type={
                                mobileView === 'highlighter'
                                    ? 'highlighter'
                                    : 'link'
                            }
                            onBack={() => setMobileView('main')}
                        />
                    )}
                </Toolbar>
                {collaborationEnabled && (
                    <div className="flex w-full items-center justify-center border-b border-border bg-muted/30 px-4 py-2 text-xs text-muted-foreground">
                        <div className="flex w-full max-w-4xl items-center justify-between gap-3">
                            <span>
                                Live editing:{' '}
                                {collaborationStatus === 'connected'
                                    ? 'connected'
                                    : collaborationStatus === 'connecting'
                                      ? 'connecting'
                                      : collaborationStatus === 'error'
                                        ? `unavailable${collaborationLastError ? ` (${collaborationLastError})` : ''}`
                                        : 'idle'}
                            </span>
                            {presenceUsers.length > 0 && (
                                <div className="flex items-center gap-2">
                                    {presenceUsers
                                        .slice(0, 5)
                                        .map((presenceUser) => (
                                            <span
                                                key={presenceUser.clientId}
                                                className="inline-flex items-center gap-1"
                                            >
                                                <span
                                                    className="h-2 w-2 rounded-full"
                                                style={{
                                                    backgroundColor:
                                                        presenceUser.color,
                                                }}
                                            />
                                                {presenceUser.name}{' '}
                                                (
                                                {getPermissionLabel(
                                                    presenceUser.permission
                                                )}
                                                )
                                            </span>
                                        ))}
                                </div>
                            )}
                        </div>
                    </div>
                )}
                <div className="w-full max-w-4xl my-8 border border-border rounded-lg shadow bg-card p-6">
                    <div
                        ref={contentWrapperRef}
                        className="content-wrapper"
                        style={{ cursor: 'text' }}
                        onMouseDown={(e) => {
                            if (e.target === e.currentTarget && editor) {
                                setTimeout(() => {
                                    // Moves text caret to text's end when you click on bottom whitepace
                                    editor.commands.focus()
                                    editor.commands.setTextSelection(
                                        editor.state.doc.content.size
                                    )
                                }, 0)
                            }
                        }}
                    >
                        {remoteCarets.map((remoteCaret) => (
                            <div
                                key={remoteCaret.clientId}
                                className="remote-editor-caret"
                                style={
                                    {
                                        '--remote-caret-color':
                                            remoteCaret.color,
                                        height: remoteCaret.height,
                                        left: remoteCaret.left,
                                        top: remoteCaret.top,
                                    } as React.CSSProperties
                                }
                                >
                                <span>
                                    {remoteCaret.name} (
                                    {getPermissionLabel(
                                        remoteCaret.permission
                                    )}
                                    )
                                </span>
                            </div>
                        ))}
                        <EditorContent
                            editor={editor}
                            role="presentation"
                            className="simple-editor-content"
                        />
                    </div>
                </div>
            </div>
        </EditorContext.Provider>
    )
}
