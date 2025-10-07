import * as vscode from 'vscode';

import { 
    setLastActiveEditor,
    setPreviousActiveEditorFilePath,
    getPreviousActiveEditorFilePath,
    getIsAutoUpd,
    getNamePanel,
    getLabelPanel,
    getGlobalGroupState
} from './state';

import { CallDefinitionProvider } from './commands/openProgramCommands';
import { debounce } from './utils/debounce';
import { setLineNumbers, editLineNumbers } from './utils/edit';
import { extractItemNames, extractLabels, extractJumps, extractSkips, extractSkipJumps } from './utils/extractors';

import { getLabelWebContent } from './webviews/labelWebview';
import { registerLabelView } from './commands/labelCommands';

import { getNameWebContent } from './webviews/nameWebview';
import { registerNameView } from './commands/nameCommands';

import { getBackupWebContent, getBackupManagerWebContent } from './webviews/backupWebview';
import { registerBackupView, registerBackupManagerView } from './commands/backupCommands';

export function activate(context: vscode.ExtensionContext) {

    // --------------------USER CONFIG-------------------
    const config = vscode.workspace.getConfiguration('fanuctpp');
    // Auto line renumbering setting (default true)
    const autoLineRenum = config.get<boolean>('autoLineRenumber', true);

    // ------------------INITIAL SETUP-------------------
    // Only set line numbers if auto-renumber is enabled
    if (autoLineRenum) {
        vscode.workspace.textDocuments.forEach(document => {
            if (document.languageId === 'fanuctp_ls') {
                setLineNumbers(document);
            }
        });
    }

    // ------------------EVENT LISTENERS-------------------
    // On document open
    const disposeOpen = vscode.workspace.onDidOpenTextDocument(document => {
        if (document.languageId === 'fanuctp_ls' && autoLineRenum) {
            setLineNumbers(document);
        }
    });

    // Debounced handler for text document changes
    const debouncedOnDidChangeTextDocument = debounce(async (event: vscode.TextDocumentChangeEvent) => {
        if (getIsAutoUpd()) {
            return;
        }

        if (event.document.languageId === 'fanuctp_ls' && autoLineRenum) {
            setLineNumbers(event.document);
            await editLineNumbers(event.document);
        }
    }, 50);

    const disposeDebounceChange = vscode.workspace.onDidChangeTextDocument(debouncedOnDidChangeTextDocument);

    // Listen for active editor change
    const disposeActiveEditorChange = vscode.window.onDidChangeActiveTextEditor(editor => {
        if (editor) {
            const currentFilePath = editor.document.uri.fsPath;
            if (currentFilePath !== getPreviousActiveEditorFilePath()) {
                setLastActiveEditor(editor);
                setPreviousActiveEditorFilePath(currentFilePath);
                handleActiveEditorChange(editor);
            }
        }
    });

    // ------------------COMMANDS-------------------
    // Manual update of line numbers
    const disposableCommand = vscode.commands.registerCommand('extension.updateLineNumbers', async () => {
        const editor = vscode.window.activeTextEditor;
        if (editor && editor.document.languageId === 'fanuctp_ls') {
            await editLineNumbers(editor.document, true);
        }
    });

    // ------------------WEBVIEW UPDATES-------------------
    function handleActiveEditorChange(editor: vscode.TextEditor) {
        const namePanel = getNamePanel();
        const labelPanel = getLabelPanel();

        if (namePanel) {
            const groupedNames = extractItemNames(editor.document);
            namePanel.webview.postMessage({ command: 'updateGroupState', groupState: getGlobalGroupState() });
            namePanel.webview.html = getNameWebContent(editor.document, groupedNames, getGlobalGroupState());
        }

        if (labelPanel) {
            const labels = extractLabels(editor.document);
            const jumps = extractJumps(editor.document, labels);
            const skips = extractSkips(editor.document, labels);
            const skipJumps = extractSkipJumps(editor.document, labels);
            labelPanel.webview.html = getLabelWebContent(editor.document, labels, jumps, skips, skipJumps);
        }
    }

    // ------------------REGISTER WEBVIEW COMMANDS-------------------
    const disposeNameView = registerNameView(context);
    const disposeLabelView = registerLabelView(context);
    const disposeBackupView = registerBackupView(context);
    const disposeBackupManagerView = registerBackupManagerView(context);

    // ------------------REGISTER DEFINITION PROVIDER-------------------
    context.subscriptions.push(vscode.languages.registerDefinitionProvider('fanuctp_ls', new CallDefinitionProvider()));

    // ------------------PUSH SUBSCRIPTIONS-------------------
    context.subscriptions.push(
        disposeOpen,
        disposeDebounceChange,
        disposeLabelView,
        disposeNameView,
        disposeActiveEditorChange,
        disposableCommand,
        disposeBackupView,
        disposeBackupManagerView
    );
}

export function deactivate() {}
