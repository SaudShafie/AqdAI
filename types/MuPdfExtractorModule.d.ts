declare module 'react-native' {
  interface NativeModulesStatic {
    MuPdfExtractorModule: {
      extractText(path: string, promise: any): void;
    };
  }
}

export interface MuPdfExtractorModule {
  extractText(path: string, promise: any): void;
}

declare const MuPdfExtractorModule: MuPdfExtractorModule;
export default MuPdfExtractorModule; 