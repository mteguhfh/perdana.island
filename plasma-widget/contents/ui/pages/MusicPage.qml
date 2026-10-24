import QtQuick
import QtQuick.Controls as QQC2
import QtQuick.Layouts
import org.kde.kirigami as Kirigami

Item {
    id: page
    property var island

    readonly property var player: island ? island.player : null
    readonly property bool hasMedia: island ? island.hasMedia : false
    readonly property real position: player ? player.position : 0
    readonly property real length: player ? player.length : 0
    property bool dragging: false
    property real displayedPosition: 0

    function timeLabel(value) {
        const seconds = Math.floor(Math.max(0, Number(value) || 0) / 1000000);
        const minutes = Math.floor(seconds / 60);
        const remainder = seconds % 60;
        return minutes + ":" + (remainder < 10 ? "0" : "") + remainder;
    }

    Rectangle {
        anchors.fill: parent
        radius: 19
        color: "#0c0d10"
        border.color: "#17191e"
        border.width: 1
        visible: page.hasMedia

        Image {
            id: artwork
            x: 14
            y: 15
            width: 55
            height: 55
            source: page.player ? page.player.artUrl : ""
            sourceSize.width: 110
            sourceSize.height: 110
            fillMode: Image.PreserveAspectCrop
            asynchronous: true
            Rectangle {
                anchors.fill: parent
                z: -1
                radius: 12
                color: "#1a1c21"
            }
            Kirigami.Icon {
                anchors.centerIn: parent
                width: 23
                height: 23
                source: "media-optical-audio"
                color: "#a9abb2"
                visible: artwork.status !== Image.Ready
            }
        }

        Text {
            x: 82
            y: 18
            width: parent.width - 160
            text: page.player ? (page.player.track || "Unknown title") : ""
            color: "#f3f3f5"
            font.pixelSize: 14
            font.weight: Font.DemiBold
            elide: Text.ElideRight
        }

        Text {
            x: 82
            y: 42
            width: parent.width - 160
            text: page.player ? (page.player.artist || page.player.identity || "") : ""
            color: "#92939a"
            font.pixelSize: 12
            elide: Text.ElideRight
        }

        Row {
            anchors.right: parent.right
            anchors.rightMargin: 17
            y: 25
            spacing: 3
            Repeater {
                model: 4
                Rectangle {
                    required property int index
                    width: 3
                    height: page.island && page.island.isPlaying ? page.island.equalizerHeights[index] : 5
                    anchors.verticalCenter: parent.verticalCenter
                    radius: 2
                    color: "#f3f3f5"
                }
            }
        }

        Row {
            x: 14
            y: 78
            width: parent.width - 28
            height: 13
            Text {
                width: 42
                text: page.timeLabel(page.position)
                color: "#a5a6ad"
                font.pixelSize: 10
                font.family: "monospace"
            }
            QQC2.Slider {
                id: seekSlider
                width: parent.width - 84
                height: 13
                from: 0
                to: page.length
                value: page.dragging ? displayedPosition : page.position
                enabled: page.player && page.player.canSeek && page.length > 0
                onPressedChanged: {
                    page.dragging = pressed;
                    page.displayedPosition = page.position;
                }
                onMoved: {
                    page.displayedPosition = value;
                    if (page.player && page.player.canSeek)
                        page.player.position = value;
                }
                background: Rectangle {
                    x: seekSlider.leftPadding
                    y: seekSlider.topPadding + seekSlider.availableHeight / 2 - 2
                    width: seekSlider.availableWidth
                    height: 4
                    radius: 2
                    color: "#34363c"
                    Rectangle {
                        width: seekSlider.visualPosition * parent.width
                        height: parent.height
                        radius: 2
                        color: "#f3f3f5"
                    }
                }
                handle: Rectangle {
                    x: seekSlider.leftPadding + seekSlider.visualPosition * (seekSlider.availableWidth - width)
                    y: seekSlider.topPadding + seekSlider.availableHeight / 2 - height / 2
                    width: 8
                    height: 8
                    radius: 4
                    color: "#fff"
                    visible: seekSlider.pressed || seekSlider.hovered
                }
            }
            Text {
                width: 42
                horizontalAlignment: Text.AlignRight
                text: page.timeLabel(page.length)
                color: "#a5a6ad"
                font.pixelSize: 10
                font.family: "monospace"
            }
        }

        Row {
            anchors.horizontalCenter: parent.horizontalCenter
            y: 111
            spacing: 18

            QQC2.ToolButton {
                icon.name: "media-skip-backward"
                icon.color: "#f4f4f6"
                enabled: page.player && page.player.canGoPrevious
                onClicked: page.player.Previous()
                Accessible.name: "Previous track"
            }

            QQC2.ToolButton {
                width: 38
                height: 38
                icon.name: page.island && page.island.isPlaying ? "media-playback-pause" : "media-playback-start"
                icon.color: "#08090b"
                enabled: page.player && page.player.canControl
                background: Rectangle { radius: 19; color: "#f4f4f6" }
                onClicked: {
                    if (!page.player)
                        return;
                    if (page.island.isPlaying)
                        page.player.Pause();
                    else
                        page.player.Play();
                }
                Accessible.name: page.island && page.island.isPlaying ? "Pause" : "Play"
            }

            QQC2.ToolButton {
                icon.name: "media-skip-forward"
                icon.color: "#f4f4f6"
                enabled: page.player && page.player.canGoNext
                onClicked: page.player.Next()
                Accessible.name: "Next track"
            }
        }
    }

    Column {
        anchors.centerIn: parent
        spacing: 7
        visible: !page.hasMedia

        Kirigami.Icon {
            anchors.horizontalCenter: parent.horizontalCenter
            width: 23
            height: 23
            source: "media-playback-start"
            color: "#72747b"
        }
        Text {
            anchors.horizontalCenter: parent.horizontalCenter
            text: "Nothing is playing"
            color: "#f3f3f5"
            font.pixelSize: 14
            font.weight: Font.DemiBold
        }
        Text {
            anchors.horizontalCenter: parent.horizontalCenter
            text: "Media controls appear here when a player is active."
            color: "#92939a"
            font.pixelSize: 11
        }
    }
}
