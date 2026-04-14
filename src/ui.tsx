// @ts-ignore
import { render, Container, Button, VerticalSpace, Text, Textbox, Divider } from '@create-figma-plugin/ui'
import { on, emit } from '@create-figma-plugin/utilities'
import { h } from 'preact'
import { useState, useEffect } from 'preact/hooks'
import axios from 'axios'

function Plugin() {
  const [webhookUrl, setWebhookUrl] = useState(() => {
    try { return localStorage.getItem('pixelporter_webhookUrl') || '' } catch { return '' }
  })
  const [folderPath, setFolderPath] = useState('')
  const [items, setItems] = useState<Array<{id: string, name: string, sizeLabel: string, format: string, customName: string}>>([])
  const [currentPreview, setCurrentPreview] = useState<{id: string, name: string, base64: string, size: number} | null>(null)
  const [editName, setEditName] = useState('')
  const [exportFormat, setExportFormat] = useState<'IMG' | 'SVG'>('IMG')
  const [loading, setLoading] = useState(false)
  const [notification, setNotification] = useState('')

  const updateWebhookUrl = (val: string) => {
    setWebhookUrl(val);
    try { localStorage.setItem('pixelporter_webhookUrl', val) } catch {}
  };

  const isConfigComplete = webhookUrl.trim() !== '' && folderPath.trim() !== '';

  const formatSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  useEffect(() => {
    const unsubscribePreview = on('SELECTION_PREVIEW', (data: any) => {
      const base64 = btoa(
        new Uint8Array(data.previewBytes).reduce((acc: string, byte: number) => acc + String.fromCharCode(byte), '')
      );
      
      setCurrentPreview({ 
        id: data.nodeId, 
        name: data.name, 
        base64: `data:image/png;base64,${base64}`,
        size: data.fileSize
      });
      setEditName(data.name);
      if (data.suggestedPath) {
        setFolderPath(data.suggestedPath);
      }
    });

    const unsubscribeUpload = on('SEND_ALL_TO_N8N', (data: any) => {
      handleUpload(data);
    });

    return () => {
      unsubscribePreview();
      unsubscribeUpload();
    };
  }, []);

  const showNotification = (message: string) => {
    setNotification(message);
    setTimeout(() => setNotification(''), 3000);
  };

  const handleUpload = async (msg: any) => {
    setLoading(true);
    try {
      for (const asset of msg.assets) {
        const formData = new FormData();
        const blob = new Blob([asset.buffer], { type: asset.format === 'SVG' ? 'image/svg+xml' : 'image/png' });
        formData.append('file', blob, asset.name);
        formData.append('folderPath', msg.folderPath);
        if (asset.customName) {
          formData.append('customName', asset.customName);
        }

        const response = await axios.post(msg.webhookUrl, formData);

        // Trigger file download from JSON response
        const resData = Array.isArray(response.data) ? response.data[0] : response.data;
        const { seoFilename, fileBase64, mimeType } = resData;
        if (fileBase64 && seoFilename) {
          const byteChars = atob(fileBase64);
          const byteArray = new Uint8Array(byteChars.length);
          for (let i = 0; i < byteChars.length; i++) {
            byteArray[i] = byteChars.charCodeAt(i);
          }
          const downloadBlob = new Blob([byteArray], { type: mimeType || 'image/webp' });
          const url = URL.createObjectURL(downloadBlob);
          const a = document.createElement('a');
          a.href = url;
          a.download = seoFilename;
          a.click();
          URL.revokeObjectURL(url);
        }
      }
      setLoading(false);
      setItems([]);
      showNotification('Uploaded successfully!');
    } catch (e: any) {
      setLoading(false);
      showNotification('Upload failed: ' + e.message);
    }
  };

  const removeFromQueue = (id: string) => {
    setItems(prev => prev.filter(item => item.id !== id));
  };

  const addToQueue = () => {
    if (currentPreview) {
      const ext = exportFormat === 'SVG' ? '.svg' : '';
      const name = editName + ext;
      const nameWasEdited = editName !== currentPreview.name;
      setItems(prev => [...prev, { 
        id: `${currentPreview.id}-${Date.now()}`, 
        name: name, 
        sizeLabel: formatSize(currentPreview.size),
        format: exportFormat,
        customName: nameWasEdited ? editName : ''
      }]);
    }
  };

  return (
    <Container space="medium">
      <VerticalSpace space="medium" />
      <Textbox value={webhookUrl} onInput={(e) => updateWebhookUrl(e.currentTarget.value)} placeholder="Webhook URL" />
      <VerticalSpace space="small" />
      <Textbox value={folderPath} onInput={(e) => setFolderPath(e.currentTarget.value)} placeholder="G-Drive Path" />
      
      <VerticalSpace space="medium" /><Divider /><VerticalSpace space="medium" />

      <div style={{ height: '140px', backgroundColor: '#F5F5F5', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid #E5E5E5', overflow: 'hidden' }}>
        {currentPreview ? (
          <img src={currentPreview.base64} style={{ maxWidth: '90%', maxHeight: '90%', objectFit: 'contain' }} />
        ) : (
          <Text style={{ color: '#B3B3B3' }}>Select a layer in Figma</Text>
        )}
      </div>

      <VerticalSpace space="small" />
      <Textbox value={editName} onInput={(e) => setEditName(e.currentTarget.value)} placeholder="Asset Name" />
      <VerticalSpace space="small" />
      <div style={{ display: 'flex', gap: '4px' }}>
        {(['IMG', 'SVG'] as const).map(fmt => (
          <span
            key={fmt}
            onClick={() => setExportFormat(fmt)}
            style={{
              flex: 1,
              textAlign: 'center',
              padding: '6px 0',
              fontSize: '11px',
              fontWeight: 'bold',
              borderRadius: '4px',
              cursor: 'pointer',
              backgroundColor: exportFormat === fmt ? '#18A0FB' : '#F0F0F0',
              color: exportFormat === fmt ? '#FFF' : '#333',
            }}
          >
            {fmt}
          </span>
        ))}
      </div>
      <VerticalSpace space="small" />
      <Button fullWidth onClick={addToQueue} disabled={!currentPreview || !isConfigComplete} secondary>
        Add to Queue
      </Button>

      <VerticalSpace space="medium" /><Divider /><VerticalSpace space="medium" />

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text style={{ fontWeight: 'bold' }}>Queue ({items.length})</Text>
        {items.length > 0 && (
          <span onClick={() => setItems([])} style={{ cursor: 'pointer', color: '#999', fontSize: '11px' }}>Clear all</span>
        )}
      </div>
      <VerticalSpace space="small" />
      {items.map(item => (
        <div key={item.id} style={{ padding: '8px', borderBottom: '1px solid #EEE', fontSize: '11px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span>
            <span style={{ display: 'inline-block', padding: '1px 4px', borderRadius: '3px', fontSize: '9px', fontWeight: 'bold', marginRight: '4px', backgroundColor: item.format === 'SVG' ? '#E8D5F5' : '#D5E8F5', color: item.format === 'SVG' ? '#7B2D8E' : '#2D5F8E' }}>{item.format}</span>
            {item.name} ({item.sizeLabel})
          </span>
          <span onClick={() => removeFromQueue(item.id)} style={{ cursor: 'pointer', color: '#999', fontSize: '13px', marginLeft: '8px', lineHeight: '1' }} title="Remove">✕</span>
        </div>
      ))}

      <VerticalSpace space="large" />
      <Button 
        fullWidth 
        onClick={() => emit('SEND_TO_PIPELINE', { webhookUrl, folderPath, items })} 
        loading={loading} 
        disabled={items.length === 0}
      >
        Send to n8n
      </Button>
      {notification && (
        <div style={{ marginTop: '8px', padding: '8px 12px', backgroundColor: notification.startsWith('Upload failed') ? '#FEE2E2' : '#D1FAE5', borderRadius: '4px', fontSize: '11px', textAlign: 'center', color: notification.startsWith('Upload failed') ? '#991B1B' : '#065F46' }}>
          {notification}
        </div>
      )}
    </Container>
  )
}

export default render(Plugin)