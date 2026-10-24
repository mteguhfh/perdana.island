import QtQuick
import QtQuick.Controls as QQC2
import QtQuick.Layouts
import org.kde.kirigami as Kirigami
import "../components" as Island

Item {
    id: page
    property var island

    readonly property int remaining: island ? island.focusRemainingSeconds() : 0
    readonly property bool running: island ? Number(island.Plasmoid.configuration.focusStartedAt || 0) > 0 : false
    readonly property real progress: island && Number(island.Plasmoid.configuration.focusSeconds) > 0
                                    ? remaining / Number(island.Plasmoid.configuration.focusSeconds) : 0

    function chooseMode(name, seconds) {
        if (!island || running)
            return;
        island.Plasmoid.configuration.focusMode = name;
        island.Plasmoid.configuration.focusSeconds = seconds;
    }

    function startFocus() {
        if (!island)
            return;
        if (remaining <= 0)
            return;
        island.now = new Date();
        island.Plasmoid.configuration.focusStartedAt = String(Date.now());
    }

    function resetFocus() {
        if (!island)
            return;
        island.Plasmoid.configuration.focusStartedAt = "0";
        island.focusFinishedNotice = false;
    }

    Canvas {
        id: ring
        x: 4
        y: 31
        width: 108
        height: 108
        onPaint: {
            const ctx = getContext("2d");
            ctx.clearRect(0, 0, width, height);
            const center = width / 2;
            const radius = 47;
            ctx.lineWidth = 5;
            ctx.lineCap = "round";
            ctx.strokeStyle = "#2a2c31";
            ctx.beginPath();
            ctx.arc(center, center, radius, 0, Math.PI * 2);
            ctx.stroke();
            ctx.strokeStyle = "#ff9f43";
            ctx.beginPath();
            ctx.arc(center, center, radius, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.max(0, Math.min(1, page.progress)));
            ctx.stroke();
        }
        Connections {
            target: page
            function onProgressChanged() { ring.requestPaint(); }
        }
        Text {
            anchors.centerIn: parent
            text: island ? island.formatDuration(page.remaining) : "25:00"
            color: "#fff"
            font.pixelSize: 20
            font.weight: Font.DemiBold
            font.family: "monospace"
        }
        Text {
            anchors.horizontalCenter: parent.horizontalCenter
            anchors.top: parent.verticalCenter
            anchors.topMargin: 16
            text: island ? island.Plasmoid.configuration.focusMode.charAt(0).toUpperCase()
                          + island.Plasmoid.configuration.focusMode.slice(1) : "Focus"
            color: "#92939a"
            font.pixelSize: 10
        }
    }

    Column {
        x: 129
        y: 17
        width: parent.width - 134
        spacing: 8

        Row {
            spacing: 5
            Island.PillButton {
                text: "Focus"
                selected: island && island.Plasmoid.configuration.focusMode === "focus"
                enabled: !page.running
                onClicked: page.chooseMode("focus", 25 * 60)
            }
            Island.PillButton {
                text: "Short"
                selected: island && island.Plasmoid.configuration.focusMode === "short"
                enabled: !page.running
                onClicked: page.chooseMode("short", 5 * 60)
            }
            Island.PillButton {
                text: "Long"
                selected: island && island.Plasmoid.configuration.focusMode === "long"
                enabled: !page.running
                onClicked: page.chooseMode("long", 15 * 60)
            }
            Island.PillButton {
                text: "Custom"
                selected: island && island.Plasmoid.configuration.focusMode === "custom"
                enabled: !page.running
                onClicked: page.chooseMode("custom", Number(customValue.text) * (unitBox.currentIndex === 0 ? 1 : 60))
            }
        }

        Row {
            spacing: 6
            QQC2.TextField {
                id: customValue
                width: 73
                height: 30
                enabled: !page.running
                text: "30"
                validator: IntValidator { bottom: 1; top: 180 }
                color: "#f4f4f6"
                placeholderText: "Duration"
                horizontalAlignment: Text.AlignHCenter
                background: Rectangle {
                    radius: 9
                    color: "#151619"
                    border.color: customValue.activeFocus ? "#ff9f43" : "#303239"
                }
            }

            QQC2.ComboBox {
                id: unitBox
                width: 88
                height: 30
                enabled: !page.running
                model: ["seconds", "minutes"]
                currentIndex: 0
                contentItem: Text {
                    text: unitBox.displayText
                    color: "#f4f4f6"
                    font.pixelSize: 11
                    verticalAlignment: Text.AlignVCenter
                    leftPadding: 10
                }
                indicator: Kirigami.Icon {
                    x: unitBox.width - width - 8
                    y: (unitBox.height - height) / 2
                    width: 14
                    height: 14
                    source: "arrow-down"
                    color: "#aeb0b7"
                }
                background: Rectangle {
                    radius: 9
                    color: "#151619"
                    border.color: unitBox.activeFocus ? "#ff9f43" : "#303239"
                }
            }

            Island.PillButton {
                text: "Apply"
                enabled: !page.running && Number(customValue.text) > 0
                onClicked: page.chooseMode("custom", Number(customValue.text) * (unitBox.currentIndex === 0 ? 1 : 60))
            }
        }

        Row {
            spacing: 7
            Island.PillButton {
                text: page.running ? "Running" : "Start"
                iconName: page.running ? "media-playback-pause" : "media-playback-start"
                accented: !page.running
                enabled: !page.running
                onClicked: page.startFocus()
            }
            Island.PillButton {
                text: "Reset"
                enabled: page.running
                onClicked: page.resetFocus()
            }
            Island.PillButton {
                text: "Skip"
                enabled: page.running
                onClicked: island.skipFocusSession()
            }
        }

        Text {
            text: island ? island.Plasmoid.configuration.focusSessionsToday + " focus sessions today" : ""
            color: "#92939a"
            font.pixelSize: 11
        }
    }

    Connections {
        target: page
        function onRemainingChanged() { ring.requestPaint(); }
    }
}
