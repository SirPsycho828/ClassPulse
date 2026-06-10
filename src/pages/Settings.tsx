import { useState, useRef, useEffect } from 'react';
import { doc, updateDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/components/ui/Toast';
import { Camera, Loader2, Play, RotateCcw, Save } from 'lucide-react';
import { useTour } from '@/components/ux/AppTour';

export default function Settings() {
  const { user, teacher } = useAuth();
  const { toast } = useToast();
  const { startTour } = useTour();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [displayName, setDisplayName] = useState('');
  const [schoolName, setSchoolName] = useState('');
  const [schoolAddress, setSchoolAddress] = useState('');
  const [photoURL, setPhotoURL] = useState('');
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  // Seed form from teacher profile
  useEffect(() => {
    if (!teacher) return;
    setDisplayName(teacher.displayName || '');
    setSchoolName(teacher.schoolName || '');
    setSchoolAddress(teacher.schoolAddress || '');
    setPhotoURL(teacher.photoURL || user?.photoURL || '');
  }, [teacher, user]);

  function markDirty() {
    setDirty(true);
  }

  const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

  async function validateImageBytes(file: File): Promise<boolean> {
    const buf = await file.slice(0, 4).arrayBuffer();
    const bytes = new Uint8Array(buf);
    // JPEG: FF D8 FF, PNG: 89 50 4E 47, GIF: 47 49 46, WebP: 52 49 46 46
    if (bytes[0] === 0xFF && bytes[1] === 0xD8 && bytes[2] === 0xFF) return true;
    if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47) return true;
    if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) return true;
    if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46) return true;
    return false;
  }

  async function handlePhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
      toast('error', 'Please select a JPG, PNG, WebP, or GIF image.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast('error', 'Image must be under 5 MB.');
      return;
    }
    if (!(await validateImageBytes(file))) {
      toast('error', 'File does not appear to be a valid image.');
      return;
    }

    setUploading(true);
    try {
      const ext = file.name.split('.').pop() || 'jpg';
      const storageRef = ref(storage, `profilePhotos/${user.uid}/profile.${ext}`);
      await uploadBytes(storageRef, file);
      const url = await getDownloadURL(storageRef);
      setPhotoURL(url);

      // Save immediately to Firestore
      await updateDoc(doc(db, 'teachers', user.uid), { photoURL: url });
      toast('success', 'Profile photo updated.');
    } catch (err) {
      console.error(err);
      toast('error', 'Failed to upload photo.');
    } finally {
      setUploading(false);
      // Reset input so re-selecting same file triggers onChange
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  async function handleSave() {
    if (!user) return;
    setSaving(true);
    try {
      await updateDoc(doc(db, 'teachers', user.uid), {
        displayName: displayName.trim(),
        schoolName: schoolName.trim(),
        schoolAddress: schoolAddress.trim(),
      });
      setDirty(false);
      toast('success', 'Settings saved.');
    } catch (err) {
      console.error(err);
      toast('error', 'Failed to save settings.');
    } finally {
      setSaving(false);
    }
  }

  const initials = displayName
    ? displayName.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
    : teacher?.email?.[0]?.toUpperCase() || '?';

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold font-heading text-foreground">Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Manage your profile and school information.
        </p>
      </div>

      {/* Profile Photo */}
      <section className="bg-card border border-border rounded-[--radius-lg] shadow-[--shadow-sm] p-6">
        <h2 className="text-lg font-semibold font-heading text-foreground mb-4">Profile Photo</h2>
        <div className="flex items-center gap-6">
          <div className="relative group">
            {photoURL ? (
              <img
                src={photoURL}
                alt="Profile"
                className="w-20 h-20 rounded-full object-cover border-2 border-border"
              />
            ) : (
              <div className="w-20 h-20 rounded-full bg-primary/10 text-primary flex items-center justify-center text-2xl font-semibold border-2 border-border">
                {initials}
              </div>
            )}
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="absolute inset-0 rounded-full bg-black/0 group-hover:bg-black/40 flex items-center justify-center transition-colors cursor-pointer"
            >
              {uploading ? (
                <Loader2 className="w-6 h-6 text-white animate-spin" />
              ) : (
                <Camera className="w-6 h-6 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
              )}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              onChange={handlePhotoUpload}
              className="hidden"
            />
          </div>
          <div className="text-sm text-muted-foreground">
            <p>Click the photo to upload a new one.</p>
            <p className="mt-1">Max 5 MB. JPG, PNG, or WebP.</p>
          </div>
        </div>
      </section>

      {/* Personal Info */}
      <section className="bg-card border border-border rounded-[--radius-lg] shadow-[--shadow-sm] p-6">
        <h2 className="text-lg font-semibold font-heading text-foreground mb-4">Personal Information</h2>
        <div className="space-y-4">
          <div>
            <label htmlFor="displayName" className="block text-sm font-medium text-foreground mb-1.5">
              Full Name
            </label>
            <input
              id="displayName"
              type="text"
              value={displayName}
              onChange={e => { setDisplayName(e.target.value); markDirty(); }}
              className="w-full px-3 py-2 border border-input rounded-[--radius-md] bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 transition-colors"
              placeholder="Your full name"
            />
          </div>
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-foreground mb-1.5">
              Email
            </label>
            <input
              id="email"
              type="email"
              value={teacher?.email || ''}
              disabled
              className="w-full px-3 py-2 border border-input rounded-[--radius-md] bg-muted/50 text-muted-foreground text-sm cursor-not-allowed"
            />
            <p className="text-xs text-muted-foreground/70 mt-1">
              Email cannot be changed here.
            </p>
          </div>
        </div>
      </section>

      {/* School Info */}
      <section className="bg-card border border-border rounded-[--radius-lg] shadow-[--shadow-sm] p-6">
        <h2 className="text-lg font-semibold font-heading text-foreground mb-4">School Information</h2>
        <div className="space-y-4">
          <div>
            <label htmlFor="schoolName" className="block text-sm font-medium text-foreground mb-1.5">
              School Name
            </label>
            <input
              id="schoolName"
              type="text"
              value={schoolName}
              onChange={e => { setSchoolName(e.target.value); markDirty(); }}
              className="w-full px-3 py-2 border border-input rounded-[--radius-md] bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 transition-colors"
              placeholder="e.g. Lincoln High School"
            />
          </div>
          <div>
            <label htmlFor="schoolAddress" className="block text-sm font-medium text-foreground mb-1.5">
              School Address
            </label>
            <textarea
              id="schoolAddress"
              value={schoolAddress}
              onChange={e => { setSchoolAddress(e.target.value); markDirty(); }}
              rows={2}
              className="w-full px-3 py-2 border border-input rounded-[--radius-md] bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 transition-colors resize-none"
              placeholder="123 Main St, City, State 12345"
            />
          </div>
        </div>
      </section>

      {/* Onboarding */}
      <section className="bg-card border border-border rounded-[--radius-lg] shadow-[--shadow-sm] p-6">
        <h2 className="text-lg font-semibold font-heading text-foreground mb-4">Onboarding</h2>
        <p className="text-sm text-muted-foreground mb-4">
          Re-run the setup wizard or replay the app tour to refresh your memory.
        </p>
        <div className="flex flex-wrap gap-3">
          <button
            onClick={() => window.location.href = '/onboarding'}
            className="flex items-center gap-2 text-sm font-medium px-4 py-2 border border-border rounded-full text-foreground hover:bg-muted/50 transition-colors"
          >
            <RotateCcw className="w-4 h-4" />
            Restart Setup Wizard
          </button>
          <button
            onClick={startTour}
            className="flex items-center gap-2 text-sm font-medium px-4 py-2 border border-border rounded-full text-foreground hover:bg-muted/50 transition-colors"
          >
            <Play className="w-4 h-4" />
            Replay App Tour
          </button>
        </div>
      </section>

      {/* Save Button */}
      <div className="flex flex-col items-end gap-1.5 pb-8">
        <button
          onClick={handleSave}
          disabled={!dirty || saving}
          className="flex items-center gap-2 bg-primary text-primary-foreground px-6 py-2.5 rounded-full text-sm font-medium hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {saving ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <Save className="w-4 h-4" />
              Save Changes
            </>
          )}
        </button>
        {!dirty && !saving && (
          <p className="text-xs text-muted-foreground/70">No unsaved changes.</p>
        )}
      </div>
    </div>
  );
}
