'use client'

import * as React from 'react'
import { EditorContent, EditorContext, useEditor } from '@tiptap/react'

// --- Tiptap Core Extensions ---
import { StarterKit } from '@tiptap/starter-kit'
import { Collaboration, isChangeOrigin } from '@tiptap/extension-collaboration'
import * as Y from 'yjs'
import { prosemirrorToYDoc } from 'y-prosemirror'
import { DOMParser as PMDOMParser, type Schema } from '@tiptap/pm/model'
import { api } from '~/trpc/react'
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
import { useSupabaseYjsCollaboration as useYjsCollaboration } from '~/hooks/use-supabase-yjs-collaboration'

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

// Yjs document state travels to/from the server as base64 text.
function bytesToBase64(bytes: Uint8Array) {
    let binary = ''
    for (let index = 0; index < bytes.length; index += 1) {
        binary += String.fromCharCode(bytes[index]!)
    }
    return window.btoa(binary)
}

function base64ToBytes(value: string) {
    const binary = window.atob(value)
    const bytes = new Uint8Array(binary.length)
    for (let index = 0; index < binary.length; index += 1) {
        bytes[index] = binary.charCodeAt(index)
    }
    return bytes
}

// Build a Yjs document from existing HTML using the editor's own schema, so the
// seeded CRDT state matches exactly what the Collaboration extension expects.
// 'default' is Tiptap Collaboration's XML fragment name — it must match here.
function htmlToYjsState(html: string, schema: Schema): Uint8Array {
    const body = new window.DOMParser().parseFromString(
        html && html.trim() ? html : '<p></p>',
        'text/html'
    ).body
    const pmNode = PMDOMParser.fromSchema(schema).parse(body)
    const doc = prosemirrorToYDoc(pmNode, 'default')
    return Y.encodeStateAsUpdate(doc)
}

interface SimpleEditorProps {
    initialContent?: string
    // Canonical Yjs state (base64) from the DB. null/undefined = not seeded yet.
    initialYjsState?: string | null
    readOnly?: boolean
    onUpdate?: (content: string, yjsState?: string) => void
    realtimeDocumentId?: string | number
    permission?: 'view' | 'comment' | 'edit'
}

export function SimpleEditor({
    initialContent,
    initialYjsState,
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
        presenceUsers,
        status: collaborationStatus,
        updatePresenceMetadata,
        ydoc,
    } = collaboration

    // Loads the canonical Yjs state into the doc exactly once, deterministically,
    // and independent of the realtime connection (this is what prevents the
    // "content only appears if the socket connects" data-loss class of bug).
    const canonicalLoadedRef = React.useRef(false)
    const seedYjsState = api.files.seedYjsStateIfAbsent.useMutation()
    const seedYjsStateRef = React.useRef(seedYjsState.mutateAsync)
    seedYjsStateRef.current = seedYjsState.mutateAsync

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
            // In collaborative mode, persist the full merged CRDT state (HTML is
            // kept too, for version history / exports / the non-collab path).
            const yjsState = collaborationEnabled
                ? bytesToBase64(Y.encodeStateAsUpdate(ydoc))
                : undefined
            onUpdate(htmlContent, yjsState)
        }

        editor.on('update', handleUpdate)

        return () => {
            editor.off('update', handleUpdate)
        }
    }, [collaborationEnabled, editor, onUpdate, ydoc])

    // Handle initialContent changes from parent. Never while the editor is
    // focused — resetting mid-typing would drop keystrokes and the caret.
    React.useEffect(() => {
        if (collaborationEnabled) return

        if (
            editor &&
            initialContent &&
            !editor.isFocused &&
            editor.getHTML() !== initialContent
        ) {
            editor.commands.setContent(initialContent)
        }
    }, [collaborationEnabled, editor, initialContent])

    // Deterministic canonical load. Runs once when the editor is ready — NOT
    // gated on the realtime connection, so your content always appears and can
    // never be silently replaced by an empty doc while the socket is down.
    React.useEffect(() => {
        if (!collaborationEnabled || !editor || canonicalLoadedRef.current) {
            return
        }
        canonicalLoadedRef.current = true

        let cancelled = false
        void (async () => {
            let canonicalBase64 = initialYjsState ?? null

            // No canonical state yet: seed it from the existing HTML and claim it
            // atomically. Whoever wins, everyone applies the SAME returned state,
            // so two simultaneous first-openers can't create divergent copies.
            if (!canonicalBase64) {
                const seedBase64 = bytesToBase64(
                    htmlToYjsState(initialContent ?? '', editor.schema)
                )
                try {
                    const result = await seedYjsStateRef.current({
                        fileId: Number(realtimeDocumentId),
                        yjsState: seedBase64,
                    })
                    canonicalBase64 = result.yjsState ?? seedBase64
                } catch (error) {
                    // Offline / seed failed: fall back to local content so the
                    // user can still see and edit; the next save persists it.
                    console.warn(
                        'Live editing: seeding failed, using local content',
                        error
                    )
                    canonicalBase64 = seedBase64
                }
            }

            if (cancelled || !canonicalBase64) return
            Y.applyUpdate(ydoc, base64ToBytes(canonicalBase64))
        })()

        return () => {
            cancelled = true
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [collaborationEnabled, editor, ydoc])

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
                <div className="relative flex min-h-0 w-full max-w-4xl flex-1 flex-col my-8 border border-border rounded-lg shadow bg-card p-6">
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
                        {/* Safe Cities stamp — sits on the document itself, so
                            it scrolls with the content but can't be deleted */}
                        <img
                            src="/safe-cities-logo.jpg"
                            alt="Safe Cities"
                            className="pointer-events-none absolute right-8 top-8 z-10 w-20 select-none"
                        />
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
