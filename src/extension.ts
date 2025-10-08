import * as vscode from 'vscode';
import * as editUtils from './utils/edit';
import { debounce } from './utils/debounce';
import { 
    getIsAutoUpd,
    setLastActiveEditor,
    getPreviousActiveEditorFilePath,
    setPreviousActiveEditorFilePath,
    getNamePanel,
    getLabelPanel,
    getGlobalGroupState
} from './state';
import { CallDefinitionProvider } from './commands/openProgramCommands';
import { extractItemNames, extractLabels, extractJumps, extractSkips, extractSkipJumps } from './utils/extractors';
import { getNameWebContent } from './webviews/nameWebview';
import { getLabelWebContent } from './webviews/labelWebview';
import { registerNameView } from './commands/nameCommands';
import { registerLabelView } from './commands/labelCommands';
import { registerBackupView, registerBackupManagerView } from './commands/backupCommands';

// ------------------HELPER: CONFIG-------------------
function isAutoLineRenumberEnabled(): boolean {
    const config = vscode.workspace.getConfiguration('fanuctpp');
    return config.get<boolean>('autoLineRenumber', true);
}

// ------------------WRAPPED UTILITIES-------------------
export function setLineNumbers(document: vscode.TextDocument) {
    if (!isAutoLineRenumberEnabled()) {
        console.log('Skipping setLineNumbers due to autoLineRenumber = false for:', document.fileName);
        return;
    }
    editUtils.setLineNumbers(document);
}

export async function editLineNumbers(document: vscode.TextDocument, force: boolean = false) {
    if (!isAutoLineRenumberEnabled() && !force) {
        console.log('Skipping editLineNumbers due to autoLineRenumber = false for:', document.fileName);
        return;
    }
    await editUtils.editLineNumbers(document, force);
}

// ------------------ACTIVATE-------------------
export function activate(context: vscode.ExtensionContext) {
    // ------------------INITIAL SETUP-------------------
    vscode.workspace.textDocuments.forEach(document => {
        if (document.languageId === 'fanuctp_ls') {
            editUtils.setLineNumbers(document); // safe, just sets initial start/end
        }
    });

    // ------------------EVENT LISTENERS-------------------
    const disposeOpen = vscode.workspace.onDidOpenTextDocument(document => {
        if (document.languageId === 'fanuctp_ls') {
            editUtils.setLineNumbers(document);
        }
    });

    const debouncedOnDidChangeTextDocument = debounce(async (event: vscode.TextDocumentChangeEvent) => {
        if (getIsAutoUpd()) return;
        if (event.document.languageId !== 'fanuctp_ls') return;

        const config = vscode.workspace.getConfiguration('fanuctpp');
        const autoLineRenum = config.get<boolean>('autoLineRenumber', true);
        if (!autoLineRenum) return;

        await editUtils.editLineNumbers(event.document);
    }, 50);

    const disposeDebounceChange = vscode.workspace.onDidChangeTextDocument(debouncedOnDidChangeTextDocument);

    // Command: manually update line numbers
    const disposableCommand = vscode.commands.registerCommand('extension.updateLineNumbers', async () => {
        const editor = vscode.window.activeTextEditor;
        if (editor && editor.document.languageId === 'fanuctp_ls') {
            await editLineNumbers(editor.document, true); // force update
        }
    });

    // Active editor changes (webview updates)
    const disposeActiveEditorChange = vscode.window.onDidChangeActiveTextEditor(editor => {
        if (!editor) return;
        const currentFilePath = editor.document.uri.fsPath;
        if (currentFilePath !== getPreviousActiveEditorFilePath()) {
            setLastActiveEditor(editor);
            setPreviousActiveEditorFilePath(currentFilePath);
            handleActiveEditorChange(editor);
        }
    });

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

    // ------------------WEBVIEWS-------------------
    const disposeNameView = registerNameView(context);
    const disposeLabelView = registerLabelView(context);
    const disposeBackupView = registerBackupView(context);
    const disposeBackupManagerView = registerBackupManagerView(context);

    // ------------------DEFINITION PROVIDER-------------------
    context.subscriptions.push(
        vscode.languages.registerDefinitionProvider('fanuctp_ls', new CallDefinitionProvider())
    );

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

// ------------------DEACTIVATE-------------------
export function deactivate() {}
