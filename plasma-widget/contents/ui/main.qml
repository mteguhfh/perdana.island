pragma ComponentBehavior: Bound

import QtQuick
import QtQuick.Layouts
import QtQuick.Controls as QQC2
import org.kde.plasma.plasmoid
import org.kde.plasma.core as PlasmaCore
import org.kde.plasma.private.mpris as Mpris
import org.kde.kirigami as Kirigami
import org.kde.notification

PlasmoidItem {
    id: root

    Layout.preferredWidth: 152
    Layout.preferredHeight: 34
    switchWidth: 480
    switchHeight: 270
    Plasmoid.backgroundHints: PlasmaCore.Types.NoBackground
    Plasmoid.icon: hasMedia ? (isPlaying ? "media-playback-playing" : "media-playback-paused") : "applications-multimedia"
    toolTipMainText: "Perdana Island"
    toolTipSubText: hasMedia ? mediaTitle : "Click to open the island"

    property string currentPage: "music"
    property var now: new Date()
    property int taskRevision: 0
    property bool focusFinishedNotice: false
    property var equalizerHeights: [5, 12, 8, 15]

    readonly property var player: mprisModel.currentPlayer
    readonly property bool hasMedia: player !== null && player !== undefined && player.playbackStatus > Mpris.PlaybackStatus.Stopped
    readonly property bool isPlaying: hasMedia && player.playbackStatus === Mpris.PlaybackStatus.Playing
    readonly property string mediaTitle: hasMedia ? (player.track || "Unknown title") : ""
    readonly property string mediaArtist: hasMedia ? (player.artist || player.identity || "") : ""
    readonly property string mediaArt: hasMedia ? (player.artUrl || "") : ""

    function formattedTime(date) {
        return Qt.locale().toString(date, "h:mm AP")
    }

    function formattedDate(date) {
        return Qt.locale().toString(date, "ddd, d MMM")
    }

    function formatDuration(seconds) {
        const value = Math.max(0, Math.floor(Number(seconds) || 0));
        const minutes = Math.floor(value / 60);
        const remainder = value % 60;
        return minutes + ":" + (remainder < 10 ? "0" : "") + remainder;
    }

    function readTasks() {
        try {
            const tasks = JSON.parse(Plasmoid.configuration.tasksJson || "[]");
            return Array.isArray(tasks) ? tasks : [];
        } catch (error) {
            return [];
        }
    }

    function saveTasks(tasks) {
        Plasmoid.configuration.tasksJson = JSON.stringify(tasks);
        taskRevision += 1;
    }

    function addTask(text) {
        const value = String(text || "").trim();
        if (!value)
            return;
        const tasks = readTasks();
        tasks.unshift({ text: value, done: false });
        saveTasks(tasks.slice(0, 50));
    }

    function setTaskDone(index, done) {
        const tasks = readTasks();
        if (index < 0 || index >= tasks.length)
            return;
        tasks[index].done = done;
        saveTasks(tasks);
    }

    function deleteTask(index) {
        const tasks = readTasks();
        if (index < 0 || index >= tasks.length)
            return;
        tasks.splice(index, 1);
        saveTasks(tasks);
    }

    function readClipboardHistory() {
        try {
            const items = JSON.parse(Plasmoid.configuration.clipboardHistory || "[]");
            return Array.isArray(items) ? items : [];
        } catch (error) {
            return [];
        }
    }

    function saveClipboardHistory(items) {
        Plasmoid.configuration.clipboardHistory = JSON.stringify(items.slice(0, 4));
    }

    function addClipboardText(text) {
        const value = String(text || "").trim();
        if (!value || value.length > 1200)
            return;
        if (/(?:password|passwd|secret|token|api[_-]?key|authorization)\s*[:=]/i.test(value)
                || /-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(value))
            return;
        const items = readClipboardHistory().filter(item => item.text !== value);
        items.unshift({ text: value, copiedAt: Date.now() });
        saveClipboardHistory(items);
    }

    function focusRemainingSeconds() {
        const startedAt = Number(Plasmoid.configuration.focusStartedAt || 0);
        if (startedAt <= 0)
            return focusFinishedNotice ? 0 : Number(Plasmoid.configuration.focusSeconds || 0);
        return Math.max(0, Number(Plasmoid.configuration.focusSeconds || 0) - Math.floor((root.now.getTime() - startedAt) / 1000));
    }

    function finishFocusSession() {
        Plasmoid.configuration.focusStartedAt = "0";
        const today = Qt.locale().toString(new Date(), "yyyy-MM-dd");
        const sameDay = Plasmoid.configuration.focusSessionsDate === today;
        Plasmoid.configuration.focusSessionsToday = sameDay ? Number(Plasmoid.configuration.focusSessionsToday) + 1 : 1;
        Plasmoid.configuration.focusSessionsDate = today;
        focusFinishedNotice = true;
        focusNoticeTimer.restart();
        focusNotification.sendEvent();
    }

    function skipFocusSession() {
        Plasmoid.configuration.focusStartedAt = "0";
    }

    function pageSource(page) {
        switch (page) {
        case "focus": return Qt.resolvedUrl("pages/FocusPage.qml");
        case "tasks": return Qt.resolvedUrl("pages/TasksPage.qml");
        case "clipboard": return Qt.resolvedUrl("pages/ClipboardPage.qml");
        default: return Qt.resolvedUrl("pages/MusicPage.qml");
        }
    }

    onExpandedChanged: {
        if (expanded && player)
            player.updatePosition();
    }

    Mpris.Mpris2Model {
        id: mprisModel
    }

    Notification {
        id: focusNotification
        componentName: "plasma_workspace"
        eventId: "notification"
        title: "Focus session complete"
        text: "Your timer has finished. Take a short break."
        iconName: "chronometer"
    }

    Timer {
        interval: 15000
        running: true
        repeat: true
        onTriggered: root.now = new Date()
    }

    Timer {
        interval: 1000
        running: Number(Plasmoid.configuration.focusStartedAt || 0) > 0
        repeat: true
        onTriggered: {
            root.now = new Date();
            if (root.focusRemainingSeconds() <= 0)
                root.finishFocusSession();
        }
    }

    Timer {
        id: focusNoticeTimer
        interval: 4500
        onTriggered: root.focusFinishedNotice = false
    }

    Timer {
        interval: 180
        running: root.isPlaying
        repeat: true
        onTriggered: root.equalizerHeights = [4 + Math.random() * 12, 4 + Math.random() * 12, 4 + Math.random() * 12, 4 + Math.random() * 12]
    }

    compactRepresentation: Item {
        id: compact
        implicitWidth: root.hasMedia ? 208 : 152
        implicitHeight: 34
        Layout.preferredWidth: implicitWidth
        Layout.preferredHeight: implicitHeight
        focus: true
        activeFocusOnTab: true
        Accessible.role: Accessible.Button
        Accessible.name: "Open Perdana Island"
        Keys.onReturnPressed: root.expanded = !root.expanded
        Keys.onSpacePressed: root.expanded = !root.expanded

        property bool hovered: compactMouse.containsMouse
        property bool blinking: false

        Rectangle {
            anchors.fill: parent
            radius: 17
            color: "#050506"
            border.color: compact.activeFocus ? "#f5f5f7" : "#191a1e"
            border.width: compact.activeFocus ? 2 : 1
        }

        Row {
            anchors.fill: parent
            anchors.leftMargin: 14
            anchors.rightMargin: 14
            spacing: 9
            visible: root.hasMedia

            Image {
                anchors.verticalCenter: parent.verticalCenter
                width: 23
                height: 23
                source: root.mediaArt
                fillMode: Image.PreserveAspectCrop
                visible: root.mediaArt.length > 0
                asynchronous: true
                sourceSize.width: 46
                sourceSize.height: 46
            }

            Text {
                anchors.verticalCenter: parent.verticalCenter
                width: compact.width - 90
                text: root.mediaTitle
                color: "#f5f5f7"
                font.pixelSize: 12
                elide: Text.ElideRight
                verticalAlignment: Text.AlignVCenter
            }

            Row {
                anchors.verticalCenter: parent.verticalCenter
                height: 18
                spacing: 2
                Repeater {
                    model: 4
                    Rectangle {
                        required property int index
                        width: 3
                        height: root.isPlaying ? root.equalizerHeights[index] : 4
                        anchors.verticalCenter: parent.verticalCenter
                        radius: 2
                        color: "#f5f5f7"
                    }
                }
            }
        }

        Row {
            anchors.centerIn: parent
            spacing: 12
            visible: !root.hasMedia

            Row {
                anchors.verticalCenter: parent.verticalCenter
                spacing: 5
                visible: !compact.hovered && !root.focusFinishedNotice && Number(Plasmoid.configuration.focusStartedAt || 0) <= 0
                Repeater {
                    model: 2
                    Rectangle {
                        width: 8
                        height: compact.blinking ? 2 : 16
                        radius: 4
                        color: "#f5f5f7"
                        Behavior on height { NumberAnimation { duration: 85; easing.type: Easing.OutQuad } }
                    }
                }
            }

            Text {
                anchors.verticalCenter: parent.verticalCenter
                visible: compact.hovered
                    && Number(Plasmoid.configuration.focusStartedAt || 0) <= 0
                    && !root.focusFinishedNotice
                text: root.formattedTime(root.now)
                color: "#f5f5f7"
                font.pixelSize: 14
                font.weight: Font.DemiBold
            }

            Text {
                anchors.verticalCenter: parent.verticalCenter
                visible: Number(Plasmoid.configuration.focusStartedAt || 0) > 0
                text: root.formatDuration(root.focusRemainingSeconds())
                color: "#ff9f43"
                font.pixelSize: 13
                font.weight: Font.DemiBold
            }

            Text {
                anchors.verticalCenter: parent.verticalCenter
                visible: root.focusFinishedNotice
                text: "Done"
                color: "#ff9f43"
                font.pixelSize: 12
                font.weight: Font.DemiBold
            }
        }

        MouseArea {
            id: compactMouse
            anchors.fill: parent
            hoverEnabled: true
            cursorShape: Qt.PointingHandCursor
            onClicked: {
                if (root.hasMedia)
                    root.currentPage = "music";
                else if (Number(Plasmoid.configuration.focusStartedAt || 0) > 0 || root.focusFinishedNotice)
                    root.currentPage = "focus";
                root.expanded = !root.expanded;
            }
        }

        Timer {
            interval: 3200
            repeat: true
            running: !root.hasMedia
                     && Number(Plasmoid.configuration.focusStartedAt || 0) <= 0
                     && !compact.hovered
            onTriggered: {
                compact.blinking = true;
                eyeBlinkTimer.restart();
                interval = 2500 + Math.floor(Math.random() * 3500);
            }
        }

        Timer {
            id: eyeBlinkTimer
            interval: 115
            onTriggered: compact.blinking = false
        }
    }

    fullRepresentation: Item {
        id: popup
        Layout.minimumWidth: 480
        Layout.preferredWidth: 480
        Layout.maximumWidth: 480
        Layout.minimumHeight: 270
        Layout.preferredHeight: 270
        Layout.maximumHeight: 270

        Rectangle {
            anchors.fill: parent
            radius: 27
            color: "#050506"
            border.color: "#1b1c20"
            border.width: 1
            clip: true

            Text {
                x: 24
                y: 17
                text: root.formattedDate(root.now)
                color: "#92939a"
                font.pixelSize: 12
            }

            Text {
                anchors.right: parent.right
                anchors.rightMargin: 24
                y: 17
                text: root.formattedTime(root.now)
                color: "#f1f1f3"
                font.pixelSize: 12
                font.weight: Font.Medium
                font.family: "monospace"
            }

            Rectangle {
                id: contentFrame
                x: 22
                y: 47
                width: parent.width - 44
                height: 171
                color: "transparent"
                clip: true

                Loader {
                    id: pageLoader
                    anchors.fill: parent
                    source: root.pageSource(root.currentPage)
                    opacity: 1
                    onLoaded: item.island = root
                }

                SequentialAnimation {
                    id: pageTransition
                    NumberAnimation { target: pageLoader; property: "opacity"; to: 0; duration: 75; easing.type: Easing.OutQuad }
                    ScriptAction { script: pageLoader.source = root.pageSource(root.currentPage) }
                    NumberAnimation { target: pageLoader; property: "opacity"; to: 1; duration: 145; easing.type: Easing.OutQuad }
                }

                Connections {
                    target: root
                    function onCurrentPageChanged() { pageTransition.restart(); }
                }
            }

            Row {
                anchors.horizontalCenter: parent.horizontalCenter
                y: 226
                spacing: 7

                Repeater {
                    model: [
                        { key: "music", text: "Music", icon: "media-playback-start" },
                        { key: "focus", text: "Focus", icon: "chronometer" },
                        { key: "tasks", text: "Tasks", icon: "view-task" },
                        { key: "clipboard", text: "Clipboard", icon: "edit-paste" }
                    ]

                    delegate: QQC2.Button {
                        id: tabButton
                        required property var modelData
                        readonly property bool active: root.currentPage === modelData.key
                        width: active ? (modelData.key === "clipboard" ? 122 : 96) : 36
                        height: 32
                        text: modelData.text
                        Accessible.name: modelData.text
                        background: Rectangle {
                            radius: 16
                            color: tabButton.active ? "#25272d" : tabButton.hovered ? "#17181c" : "transparent"
                            border.width: tabButton.activeFocus ? 2 : 0
                            border.color: "#f3f3f5"
                            Behavior on color { ColorAnimation { duration: 120 } }
                        }
                        Behavior on width { NumberAnimation { duration: 180; easing.type: Easing.OutCubic } }

                        contentItem: Row {
                            anchors.centerIn: parent
                            spacing: 7
                            Kirigami.Icon {
                                width: 16
                                height: 16
                                source: tabButton.modelData.icon
                                color: "#f3f3f5"
                            }
                            Text {
                                visible: tabButton.active
                                text: tabButton.modelData.text
                                color: "#f3f3f5"
                                font.pixelSize: 12
                                font.weight: Font.Medium
                            }
                        }
                        onClicked: root.currentPage = modelData.key
                    }
                }
            }
        }
    }
}
