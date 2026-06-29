// File tree operations for modification and updates
import type { FileNode } from '~/components/file-tree'
import { fileTreeCache } from './file-tree-cache'

/**
 * Create a new node in the file tree (does not make any API calls)
 */
export function createNodeInTree(
    tree: FileNode[],
    newNode: FileNode,
    parentId: number | null
): FileNode[] {
    // Deep clone the tree to maintain immutability
    const newTree = JSON.parse(JSON.stringify(tree)) as FileNode[]

    // If no parent, add to root
    if (parentId === null) {
        return [...newTree, newNode]
    }

    // Find parent node
    const addToParent = (nodes: FileNode[]): boolean => {
        for (let i = 0; i < nodes.length; i++) {
            if (nodes[i].id === parentId) {
                // Initialize children array if it doesn't exist
                if (!nodes[i].children) {
                    nodes[i].children = []
                }
                // Add new node to parent's children
                nodes[i].children.push(newNode)
                return true
            }

            // Recursively search children
            if (nodes[i].children?.length) {
                if (addToParent(nodes[i].children)) {
                    return true
                }
            }
        }

        return false
    }

    addToParent(newTree)

    // Clear the relevant caches
    fileTreeCache.clearAll()

    return newTree
}

/**
 * Delete a node from the file tree (does not make any API calls)
 */
export function deleteNodeFromTree(
    tree: FileNode[],
    nodeId: number
): FileNode[] {
    // Deep clone the tree to maintain immutability
    const newTree = JSON.parse(JSON.stringify(tree)) as FileNode[]

    // Check if the node is at the root level
    const rootIndex = newTree.findIndex((node) => node.id === nodeId)
    if (rootIndex !== -1) {
        newTree.splice(rootIndex, 1)
        fileTreeCache.clearFileCache(nodeId)
        return newTree
    }

    // Search through tree and delete node
    const deleteFromParent = (nodes: FileNode[]): boolean => {
        for (const node of nodes) {
            if (node.children?.length) {
                const childIndex = node.children.findIndex(
                    (child) => child.id === nodeId
                )

                if (childIndex !== -1) {
                    // Delete the node
                    node.children.splice(childIndex, 1)
                    fileTreeCache.clearFileCache(nodeId)
                    return true
                }

                // Recursively search children
                if (deleteFromParent(node.children)) {
                    return true
                }
            }
        }

        return false
    }

    deleteFromParent(newTree)

    return newTree
}

/**
 * Update a node in the file tree (does not make any API calls)
 */
export function updateNodeInTree(
    tree: FileNode[],
    nodeId: number,
    updates: Partial<FileNode>
): FileNode[] {
    // Deep clone the tree to maintain immutability
    const newTree = JSON.parse(JSON.stringify(tree)) as FileNode[]

    // Update node if found
    const updateNode = (nodes: FileNode[]): boolean => {
        for (let i = 0; i < nodes.length; i++) {
            if (nodes[i].id === nodeId) {
                nodes[i] = { ...nodes[i], ...updates }
                fileTreeCache.clearFileCache(nodeId)
                return true
            }

            if (nodes[i].children?.length) {
                if (updateNode(nodes[i].children)) {
                    return true
                }
            }
        }

        return false
    }

    updateNode(newTree)

    return newTree
}

/**
 * Move a node to a new parent in the file tree (does not make any API calls)
 */
export function moveNodeInTree(
    tree: FileNode[],
    nodeId: number,
    newParentId: number | null
): FileNode[] {
    // Find the node to move
    const nodeToMove = fileTreeCache.findNode(nodeId, tree)
    if (!nodeToMove) return tree

    // Create a deep clone of the node to move
    const nodeClone = JSON.parse(JSON.stringify(nodeToMove)) as FileNode

    // Explicitly update the parentId property
    nodeClone.parentId = newParentId

    // First remove the node from its current location
    const treeWithoutNode = deleteNodeFromTree(tree, nodeId)

    // Then add it to the new location with updated parentId
    return createNodeInTree(treeWithoutNode, nodeClone, newParentId)
}

/**
 * Sort children of a node by type and name
 */
export function sortNodeChildren(
    tree: FileNode[],
    parentId: number | null
): FileNode[] {
    // Deep clone the tree to maintain immutability
    const newTree = JSON.parse(JSON.stringify(tree)) as FileNode[]

    const sortComparator = (a: FileNode, b: FileNode): number => {
        // First by type (folders first)
        const aIsFolder = a.isFolder || a.type === 'folder'
        const bIsFolder = b.isFolder || b.type === 'folder'

        if (aIsFolder && !bIsFolder) return -1
        if (!aIsFolder && bIsFolder) return 1

        // Then alphabetically by name
        const aName = a.filename || a.name || ''
        const bName = b.filename || b.name || ''

        return aName.localeCompare(bName)
    }

    const sortChildren = (nodes: FileNode[]): void => {
        for (const node of nodes) {
            if (node.children?.length) {
                // Sort this node's children
                node.children.sort(sortComparator)

                // Recursively sort grandchildren
                sortChildren(node.children)
            }
        }
    }

    if (parentId === null) {
        // Sort root nodes
        newTree.sort(sortComparator)
        // Sort all children recursively
        sortChildren(newTree)
    } else {
        // Find the specific node and sort its children
        const sortSpecificNode = (nodes: FileNode[]): boolean => {
            for (const node of nodes) {
                if (node.id === parentId) {
                    if (node.children?.length) {
                        node.children.sort(sortComparator)
                        sortChildren(node.children)
                    }
                    return true
                }

                if (node.children?.length) {
                    if (sortSpecificNode(node.children)) {
                        return true
                    }
                }
            }

            return false
        }

        sortSpecificNode(newTree)
    }

    // Clear filtered tree cache since ordering changed
    fileTreeCache.clearAll()

    return newTree
}

/**
 * Get all descendant IDs of a node
 */
export function getAllDescendantIds(
    tree: FileNode[],
    nodeId: number
): number[] {
    const node = fileTreeCache.findNode(nodeId, tree)
    if (!node?.children?.length) return []

    const descendantIds: number[] = []

    const collectIds = (nodes: FileNode[]): void => {
        for (const node of nodes) {
            descendantIds.push(node.id)

            if (node.children?.length) {
                collectIds(node.children)
            }
        }
    }

    collectIds(node.children)

    return descendantIds
}

/**
 * Flatten the file tree into an array of nodes
 */
export function flattenTree(tree: FileNode[]): FileNode[] {
    const flattened: FileNode[] = []

    const flatten = (nodes: FileNode[]): void => {
        for (const node of nodes) {
            flattened.push(node)

            if (node.children?.length) {
                flatten(node.children)
            }
        }
    }

    flatten(tree)

    return flattened
}

/**
 * Get nodes by type from the file tree
 */
export function getNodesByType(tree: FileNode[], type: string): FileNode[] {
    const nodes: FileNode[] = []

    const collect = (currentNodes: FileNode[]): void => {
        for (const node of currentNodes) {
            if (node.type === type || (type === 'folder' && node.isFolder)) {
                nodes.push(node)
            }

            if (node.children?.length) {
                collect(node.children)
            }
        }
    }

    collect(tree)

    return nodes
}

/**
 * Extract breadcrumb path for a node
 */
export function getNodeBreadcrumbs(
    tree: FileNode[],
    nodeId: number
): FileNode[] {
    const pathIds = fileTreeCache.getPath(nodeId, tree)
    return pathIds
        .map((id) => fileTreeCache.findNode(id, tree))
        .filter((node): node is FileNode => !!node)
}
