'use client'

import type { ChangeEvent } from 'react'
import { useRef, useState } from 'react'
import { useUser } from '@clerk/nextjs'
import { api } from '~/trpc/react'
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from '~/components/ui/card'
import { Avatar, AvatarFallback, AvatarImage } from '~/components/ui/avatar'
import { Button } from '~/components/ui/button'
import { Input } from '~/components/ui/input'
import { Label } from '~/components/ui/label'
import { Badge } from '~/components/ui/badge'
import { Separator } from '~/components/ui/separator'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '~/components/ui/dialog'
import { useToast } from '~/hooks/use-toast'
import { Camera, Edit2, Save, X } from 'lucide-react'

const AVATAR_EDITOR_SIZE = 320
const CROPPED_AVATAR_SIZE = 512

function getContainedSize(
    width: number,
    height: number,
    containerSize: number
) {
    const scale = Math.min(containerSize / width, containerSize / height)
    return {
        width: width * scale,
        height: height * scale,
    }
}

function loadImage(src: string) {
    return new Promise<HTMLImageElement>((resolve, reject) => {
        const image = new window.Image()
        image.onload = () => resolve(image)
        image.onerror = () =>
            reject(new Error('Could not load the selected image.'))
        image.src = src
    })
}

async function cropAvatarImage(params: {
    src: string
    zoom: number
    offsetX: number
    offsetY: number
    imageWidth: number
    imageHeight: number
}) {
    const image = await loadImage(params.src)
    const canvas = document.createElement('canvas')
    canvas.width = CROPPED_AVATAR_SIZE
    canvas.height = CROPPED_AVATAR_SIZE

    const context = canvas.getContext('2d')
    if (!context) {
        throw new Error('Could not prepare the image editor.')
    }

    const baseScale = Math.min(
        CROPPED_AVATAR_SIZE / params.imageWidth,
        CROPPED_AVATAR_SIZE / params.imageHeight
    )
    const scale = baseScale * params.zoom
    const offsetScale = CROPPED_AVATAR_SIZE / AVATAR_EDITOR_SIZE
    const drawWidth = params.imageWidth * scale
    const drawHeight = params.imageHeight * scale
    const drawX =
        (CROPPED_AVATAR_SIZE - drawWidth) / 2 + params.offsetX * offsetScale
    const drawY =
        (CROPPED_AVATAR_SIZE - drawHeight) / 2 + params.offsetY * offsetScale

    context.clearRect(0, 0, CROPPED_AVATAR_SIZE, CROPPED_AVATAR_SIZE)
    context.drawImage(image, drawX, drawY, drawWidth, drawHeight)

    const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, 'image/jpeg', 0.92)
    )

    if (!blob) {
        throw new Error('Could not export the edited image.')
    }

    return blob
}

export default function ProfilePage() {
    const { user, isSignedIn, isLoaded } = useUser()
    const { toast } = useToast()

    // Get user profile from our database
    const {
        data: userProfile,
        isLoading,
        refetch,
    } = api.user.getProfile.useQuery()

    // Editing state
    const [isEditing, setIsEditing] = useState(false)
    const [editedName, setEditedName] = useState('')
    const [isUploadingImage, setIsUploadingImage] = useState(false)
    const [isImageEditorOpen, setIsImageEditorOpen] = useState(false)
    const [selectedImageSrc, setSelectedImageSrc] = useState<string | null>(null)
    const [selectedImageName, setSelectedImageName] = useState('profile-photo.jpg')
    const [selectedImageSize, setSelectedImageSize] = useState<{
        width: number
        height: number
    } | null>(null)
    const [zoom, setZoom] = useState(1)
    const [offsetX, setOffsetX] = useState(0)
    const [offsetY, setOffsetY] = useState(0)
    const imageInputRef = useRef<HTMLInputElement | null>(null)

    // Update profile mutation
    const updateProfileMutation = api.user.updateUserProfile.useMutation({
        onSuccess: () => {
            toast({
                title: 'Profile Updated',
                description: 'Your profile has been updated successfully.',
            })
            setIsEditing(false)
            refetch()
        },
        onError: (error) => {
            toast({
                title: 'Update Failed',
                description: error.message,
                variant: 'destructive',
            })
        },
    })

    if (!isLoaded || isLoading) {
        return (
            <div className="container mx-auto p-6">
                <div className="flex items-center justify-center min-h-[50vh]">
                    <p className="text-muted-foreground">Loading profile...</p>
                </div>
            </div>
        )
    }

    if (!isSignedIn) {
        return (
            <div className="container mx-auto p-6">
                <Card>
                    <CardHeader>
                        <CardTitle>Authentication Required</CardTitle>
                        <CardDescription>
                            You need to sign in to view your profile.
                        </CardDescription>
                    </CardHeader>
                </Card>
            </div>
        )
    }

    const handleEditClick = () => {
        const profileName =
            userProfile && 'name' in userProfile ? userProfile.name : ''
        setEditedName(profileName || user?.fullName || '')
        setIsEditing(true)
    }

    const handleSave = async () => {
        if (!editedName.trim()) {
            toast({
                title: 'Name Required',
                description: 'Please enter a valid name.',
                variant: 'destructive',
            })
            return
        }

        await updateProfileMutation.mutateAsync({
            name: editedName.trim(),
        })
    }

    const handleCancel = () => {
        setIsEditing(false)
        setEditedName('')
    }

    const handleImageSelection = async (event: ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0]
        if (!file || !user) return

        if (!file.type.startsWith('image/')) {
            toast({
                title: 'Invalid file',
                description: 'Please choose an image file.',
                variant: 'destructive',
            })
            event.target.value = ''
            return
        }

        if (file.size > 5 * 1024 * 1024) {
            toast({
                title: 'File too large',
                description: 'Please upload an image smaller than 5MB.',
                variant: 'destructive',
            })
            event.target.value = ''
            return
        }

        const objectUrl = URL.createObjectURL(file)
        const image = await loadImage(objectUrl)
        setSelectedImageSrc((current) => {
            if (current?.startsWith('blob:')) URL.revokeObjectURL(current)
            return objectUrl
        })
        setSelectedImageSize({
            width: image.naturalWidth || image.width,
            height: image.naturalHeight || image.height,
        })
        setSelectedImageName(
            file.name.replace(/\.[^.]+$/, '') || 'profile-photo'
        )
        setZoom(1)
        setOffsetX(0)
        setOffsetY(0)
        setIsImageEditorOpen(true)
        event.target.value = ''
    }

    const handleImageEditorClose = (open: boolean) => {
        setIsImageEditorOpen(open)
        if (!open) {
            setSelectedImageSrc((current) => {
                if (current?.startsWith('blob:')) URL.revokeObjectURL(current)
                return null
            })
            setSelectedImageSize(null)
            setZoom(1)
            setOffsetX(0)
            setOffsetY(0)
        }
    }

    const handleCroppedUpload = async () => {
        if (!selectedImageSrc || !user || !selectedImageSize) return

        try {
            setIsUploadingImage(true)

            const croppedBlob = await cropAvatarImage({
                src: selectedImageSrc,
                zoom,
                offsetX,
                offsetY,
                imageWidth: selectedImageSize.width,
                imageHeight: selectedImageSize.height,
            })

            const croppedFile = new File(
                [croppedBlob],
                `${selectedImageName}.jpg`,
                {
                    type: 'image/jpeg',
                }
            )

            await user.setProfileImage({ file: croppedFile })
            await user.reload()
            handleImageEditorClose(false)
            toast({
                title: 'Profile picture updated',
                description: 'Your new profile picture is now in use.',
            })
        } catch (error) {
            toast({
                title: 'Upload failed',
                description:
                    error instanceof Error
                        ? error.message
                        : 'Could not update your profile picture.',
                variant: 'destructive',
            })
        } finally {
            setIsUploadingImage(false)
        }
    }

    const previewImageSize = selectedImageSize
        ? getContainedSize(
              selectedImageSize.width,
              selectedImageSize.height,
              AVATAR_EDITOR_SIZE
          )
        : null

    return (
        <div className="container mx-auto p-6 max-w-4xl">
            <div className="mb-8">
                <h1 className="text-3xl font-bold tracking-tight">Profile</h1>
                <p className="text-muted-foreground mt-2">
                    Manage your account settings and profile information
                </p>
            </div>

            <div className="space-y-6">
                {/* Main Profile Card */}
                <Card>
                    <CardHeader>
                        <div className="flex items-center justify-between">
                            <div>
                                <CardTitle>Profile Information</CardTitle>
                                <CardDescription>
                                    Update your personal information and account
                                    details
                                </CardDescription>
                            </div>
                            {!isEditing && (
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={handleEditClick}
                                >
                                    <Edit2 className="w-4 h-4 mr-2" />
                                    Edit Profile
                                </Button>
                            )}
                        </div>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        {/* Avatar and Name Section */}
                        <div className="flex items-start gap-6">
                            <div className="flex flex-col items-center gap-3">
                                <Avatar className="h-20 w-20">
                                    <AvatarImage
                                        src={user?.imageUrl}
                                        alt={
                                            (userProfile && 'name' in userProfile
                                                ? userProfile.name
                                                : '') ||
                                            user?.fullName ||
                                            'User'
                                        }
                                    />
                                    <AvatarFallback className="text-lg">
                                        {(
                                            (userProfile && 'name' in userProfile
                                                ? userProfile.name
                                                : '') ||
                                            user?.fullName ||
                                            'U'
                                        )
                                            .charAt(0)
                                            .toUpperCase()}
                                    </AvatarFallback>
                                </Avatar>
                                <input
                                    ref={imageInputRef}
                                    type="file"
                                    accept="image/*"
                                    className="hidden"
                                    onChange={handleImageSelection}
                                />
                                <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    className="gap-2"
                                    disabled={isUploadingImage}
                                    onClick={() =>
                                        imageInputRef.current?.click()
                                    }
                                >
                                    <Camera className="h-4 w-4" />
                                    {isUploadingImage
                                        ? 'Uploading...'
                                        : 'Upload Photo'}
                                </Button>
                            </div>

                            <div className="flex-1 space-y-4">
                                {isEditing ? (
                                    <div className="space-y-4">
                                        <div className="space-y-2">
                                            <Label htmlFor="name">
                                                Full Name
                                            </Label>
                                            <Input
                                                id="name"
                                                value={editedName}
                                                onChange={(e) =>
                                                    setEditedName(
                                                        e.target.value
                                                    )
                                                }
                                                placeholder="Enter your full name"
                                                className="max-w-md"
                                            />
                                        </div>
                                        <div className="flex gap-2">
                                            <Button
                                                onClick={handleSave}
                                                disabled={
                                                    updateProfileMutation.isPending
                                                }
                                                size="sm"
                                            >
                                                <Save className="w-4 h-4 mr-2" />
                                                {updateProfileMutation.isPending
                                                    ? 'Saving...'
                                                    : 'Save Changes'}
                                            </Button>
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={handleCancel}
                                                disabled={
                                                    updateProfileMutation.isPending
                                                }
                                            >
                                                <X className="w-4 h-4 mr-2" />
                                                Cancel
                                            </Button>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="space-y-2">
                                        <div>
                                            <h3 className="text-xl font-semibold">
                                                {(userProfile &&
                                                'name' in userProfile
                                                    ? userProfile.name
                                                    : '') ||
                                                    user?.fullName ||
                                                    'No name set'}
                                            </h3>
                                            <p className="text-muted-foreground">
                                                {
                                                    user?.primaryEmailAddress
                                                        ?.emailAddress
                                                }
                                            </p>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <Badge
                                                variant={
                                                    userProfile &&
                                                    'role' in userProfile &&
                                                    userProfile.role === 'admin'
                                                        ? 'default'
                                                        : 'secondary'
                                                }
                                            >
                                                {(userProfile &&
                                                'role' in userProfile
                                                    ? userProfile.role
                                                    : null) || 'unverified'}
                                            </Badge>
                                            {user?.primaryEmailAddress
                                                ?.verification?.status ===
                                                'verified' && (
                                                <Badge
                                                    variant="outline"
                                                    className="text-green-600 border-green-600"
                                                >
                                                    ✓ Email Verified
                                                </Badge>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>

                        <Separator />

                        {/* Account Details */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="space-y-4">
                                <h4 className="font-medium text-foreground">
                                    Account Details
                                </h4>
                                <div className="space-y-3">
                                    <div>
                                        <Label className="text-sm text-muted-foreground">
                                            User ID
                                        </Label>
                                        <p className="text-sm font-mono mt-1">
                                            {user?.id}
                                        </p>
                                    </div>
                                    <div>
                                        <Label className="text-sm text-muted-foreground">
                                            Email Address
                                        </Label>
                                        <p className="text-sm mt-1">
                                            {
                                                user?.primaryEmailAddress
                                                    ?.emailAddress
                                            }
                                        </p>
                                    </div>
                                    <div>
                                        <Label className="text-sm text-muted-foreground">
                                            Account Role
                                        </Label>
                                        <p className="text-sm mt-1 capitalize">
                                            {(userProfile &&
                                            'role' in userProfile
                                                ? userProfile.role
                                                : null) || 'unverified'}
                                        </p>
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-4">
                                <h4 className="font-medium text-foreground">
                                    Account Statistics
                                </h4>
                                <div className="space-y-3">
                                    <div>
                                        <Label className="text-sm text-muted-foreground">
                                            Member Since
                                        </Label>
                                        <p className="text-sm mt-1">
                                            {userProfile?.createdAt
                                                ? userProfile.createdAt.toLocaleDateString(
                                                      'en-US',
                                                      {
                                                          year: 'numeric',
                                                          month: 'long',
                                                          day: 'numeric',
                                                      }
                                                  )
                                                : user?.createdAt
                                                  ? new Date(
                                                        user.createdAt
                                                    ).toLocaleDateString(
                                                        'en-US',
                                                        {
                                                            year: 'numeric',
                                                            month: 'long',
                                                            day: 'numeric',
                                                        }
                                                    )
                                                  : 'Unknown'}
                                        </p>
                                    </div>
                                    <div>
                                        <Label className="text-sm text-muted-foreground">
                                            Last Updated
                                        </Label>
                                        <p className="text-sm mt-1">
                                            {userProfile?.updatedAt
                                                ? userProfile.updatedAt.toLocaleDateString(
                                                      'en-US',
                                                      {
                                                          year: 'numeric',
                                                          month: 'long',
                                                          day: 'numeric',
                                                      }
                                                  )
                                                : 'Never'}
                                        </p>
                                    </div>
                                    <div>
                                        <Label className="text-sm text-muted-foreground">
                                            Profile Status
                                        </Label>
                                        <p className="text-sm mt-1">
                                            {userProfile ? (
                                                <span className="text-green-600">
                                                    ✓ Synchronized
                                                </span>
                                            ) : (
                                                <span className="text-yellow-600">
                                                    ⚠ Not synchronized
                                                </span>
                                            )}
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>

            <Dialog
                open={isImageEditorOpen}
                onOpenChange={handleImageEditorClose}
            >
                <DialogContent className="sm:max-w-[32rem]">
                    <DialogHeader>
                        <DialogTitle>Edit profile picture</DialogTitle>
                        <DialogDescription>
                            Adjust the frame before uploading your new profile
                            picture.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-5">
                        <div className="flex justify-center">
                            <div
                                className="relative overflow-hidden rounded-[2rem] border border-border/70 bg-muted/30 shadow-inner"
                                style={{
                                    width: AVATAR_EDITOR_SIZE,
                                    height: AVATAR_EDITOR_SIZE,
                                }}
                            >
                                {selectedImageSrc && previewImageSize ? (
                                    <div
                                        className="absolute left-1/2 top-1/2"
                                        style={{
                                            transform: `translate(calc(-50% + ${offsetX}px), calc(-50% + ${offsetY}px))`,
                                        }}
                                    >
                                        <img
                                            src={selectedImageSrc}
                                            alt="Profile crop preview"
                                            className="block max-w-none select-none"
                                            style={{
                                                width: previewImageSize.width,
                                                height: previewImageSize.height,
                                                transform: `scale(${zoom})`,
                                                transformOrigin: 'center center',
                                            }}
                                        />
                                    </div>
                                ) : null}
                                <div className="pointer-events-none absolute inset-4 rounded-full border-2 border-white/90 shadow-[0_0_0_9999px_rgba(15,23,42,0.26)]" />
                            </div>
                        </div>

                        <div className="space-y-4">
                            <div className="space-y-2">
                                <Label htmlFor="avatar-zoom">Zoom</Label>
                                <input
                                    id="avatar-zoom"
                                    type="range"
                                    min="1"
                                    max="2.5"
                                    step="0.05"
                                    value={zoom}
                                    onChange={(event) =>
                                        setZoom(Number(event.target.value))
                                    }
                                    className="w-full"
                                />
                            </div>
                            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                                <div className="space-y-2">
                                    <Label htmlFor="avatar-x">
                                        Horizontal
                                    </Label>
                                    <input
                                        id="avatar-x"
                                        type="range"
                                        min="-120"
                                        max="120"
                                        step="1"
                                        value={offsetX}
                                        onChange={(event) =>
                                            setOffsetX(
                                                Number(event.target.value)
                                            )
                                        }
                                        className="w-full"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="avatar-y">Vertical</Label>
                                    <input
                                        id="avatar-y"
                                        type="range"
                                        min="-120"
                                        max="120"
                                        step="1"
                                        value={offsetY}
                                        onChange={(event) =>
                                            setOffsetY(
                                                Number(event.target.value)
                                            )
                                        }
                                        className="w-full"
                                    />
                                </div>
                            </div>
                        </div>
                    </div>

                    <DialogFooter>
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => handleImageEditorClose(false)}
                            disabled={isUploadingImage}
                        >
                            Cancel
                        </Button>
                        <Button
                            type="button"
                            onClick={handleCroppedUpload}
                            disabled={isUploadingImage || !selectedImageSrc}
                        >
                            {isUploadingImage ? 'Uploading...' : 'Save Photo'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    )
}
