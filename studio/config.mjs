import {resolve} from 'node:path';
export function loadConfig(env=process.env){
  const port=Number(env.PORT||8080);if(!Number.isInteger(port)||port<1||port>65535)throw new Error('PORT is invalid.');
  return {
    port,host:env.HOST||'127.0.0.1',dataDir:resolve(env.DATA_DIR||'.cvyclip-data'),
    openaiApiKey:env.OPENAI_API_KEY||'',workspacePassword:env.WORKSPACE_PASSWORD||'',
    azureStorageConnectionString:env.AZURE_STORAGE_CONNECTION_STRING||'',azureStorageUrl:env.AZURE_STORAGE_URL||'',azureStorageContainer:env.AZURE_STORAGE_CONTAINER||'cvyclip-private',
    transcriptionModel:env.OPENAI_TRANSCRIPTION_MODEL||'whisper-1',highlightModel:env.OPENAI_HIGHLIGHT_MODEL||'gpt-4.1-mini',
    maxUploadBytes:200*1024*1024,maxDuration:1200,dailyAnalysisSeconds:1200,retentionDays:7,
    secureCookies:env.NODE_ENV==='production',trustProxy:env.TRUST_PROXY==='1',publicOrigin:env.PUBLIC_ORIGIN||'',
    ffmpegPath:env.FFMPEG_PATH||'',ffprobePath:env.FFPROBE_PATH||'',sessionHours:12
  };
}
