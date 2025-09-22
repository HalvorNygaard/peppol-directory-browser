import 'zone.js'; // Included for Angular change detection
import { bootstrapApplication } from '@angular/platform-browser';
import { AppComponent } from './app.component';
import { provideRouter } from '@angular/router';
import { importProvidersFrom } from '@angular/core';
import { HttpClientModule } from '@angular/common/http';

bootstrapApplication(AppComponent, {
  providers: [
    provideRouter([
      { path: '', component: AppComponent }
    ]),
    importProvidersFrom(HttpClientModule)
  ]
}).catch((err: any) => console.error(err));