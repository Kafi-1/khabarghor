/**
 * ImgBB image upload – returns hosted URL to save in Firestore
 * API key is public (client-side); restrict by domain in production if needed.
 */
const IMGBB_KEY = '6139c158477e6005d50817a32aedb031';

/**
 * Upload a File to ImgBB. Returns the display URL string.
 */
export async function uploadToImgBB(file) {
  if (!file || !file.type.startsWith('image/')) {
    throw new Error('Please select an image file');
  }
  if (file.size > 8 * 1024 * 1024) {
    throw new Error('Image must be under 8 MB');
  }

  const form = new FormData();
  form.append('image', file);

  const res = await fetch(`https://api.imgbb.com/1/upload?key=${IMGBB_KEY}`, {
    method: 'POST',
    body: form
  });
  const json = await res.json();
  if (!json.success || !json.data?.url) {
    throw new Error(json.error?.message || 'Upload failed');
  }
  // Prefer medium display URL; fall back to full
  return json.data.display_url || json.data.url;
}

/**
 * Build a reusable upload field HTML + bind events.
 * container: element that will hold the UI
 * onUploaded(url): called when upload succeeds
 * currentUrl: existing image URL (optional)
 */
export function bindImageUpload(container, { onUploaded, currentUrl = '' } = {}) {
  container.innerHTML = `
    <div class="img-upload-wrap">
      <div class="img-upload-preview" id="img-prev">
        ${currentUrl
          ? `<img src="${currentUrl.replace(/"/g, '')}" alt="Preview">`
          : `<span class="img-upload-placeholder">📷 No image</span>`}
      </div>
      <div class="img-upload-actions">
        <label class="adm-btn primary img-upload-btn">
          Choose image
          <input type="file" accept="image/*" id="img-file" hidden>
        </label>
        <button type="button" class="adm-btn" id="img-clear" ${currentUrl ? '' : 'style="display:none"'}>Remove</button>
        <span class="img-upload-status" id="img-status"></span>
      </div>
      <input type="hidden" id="img-url" value="${(currentUrl || '').replace(/"/g, '&quot;')}">
    </div>`;

  const fileInput = container.querySelector('#img-file');
  const status = container.querySelector('#img-status');
  const prev = container.querySelector('#img-prev');
  const hidden = container.querySelector('#img-url');
  const clearBtn = container.querySelector('#img-clear');

  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    status.textContent = 'Uploading…';
    status.style.color = 'var(--text-muted)';
    try {
      const url = await uploadToImgBB(file);
      hidden.value = url;
      prev.innerHTML = `<img src="${url}" alt="Preview">`;
      clearBtn.style.display = '';
      status.textContent = 'Uploaded ✓';
      status.style.color = '#2e7d32';
      if (onUploaded) onUploaded(url);
    } catch (e) {
      status.textContent = e.message || 'Upload failed';
      status.style.color = '#c62828';
    }
    fileInput.value = '';
  });

  clearBtn.addEventListener('click', () => {
    hidden.value = '';
    prev.innerHTML = `<span class="img-upload-placeholder">📷 No image</span>`;
    clearBtn.style.display = 'none';
    status.textContent = '';
    if (onUploaded) onUploaded('');
  });
}

export function getUploadedImageUrl(container) {
  return container?.querySelector('#img-url')?.value?.trim() || '';
}
