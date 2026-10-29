import QtQuick
import QtQuick.Controls as QQC2
import QtQuick.Layouts
import org.kde.kirigami as Kirigami
import "../components" as Island

Item {
    id: page
    property var island
    property var tasks: []
    property int draftPriority: 0
    readonly property var priorityOrder: [null, "high", "medium", "low"]
    readonly property var priorityLabels: ["Prio", "High", "Med", "Low"]
    readonly property int doneCount: tasks.filter(task => task.done).length
    readonly property int agendaCount: tasks.filter(task =>
        !task.done && task.due !== null && task.dueDate === todayKey()).length
    readonly property int doneToday: tasks.filter(task =>
        task.done && task.doneAt && island
            && island.dateKey(new Date(task.doneAt)) === todayKey()).length

    function todayKey() {
        return island ? island.dateKey(new Date()) : Qt.formatDate(new Date(), "yyyy-MM-dd");
    }

    function formatClock(minutes) {
        return island ? island.formatClock(minutes) : "";
    }

    function reload() {
        if (island)
            tasks = island.readTasks();
    }

    function addTask() {
        if (!island)
            return;
        const value = taskInput.text.trim();
        if (!value)
            return;
        let due = null;
        const timeText = timeInput.text.trim();
        if (timeText) {
            const match = timeText.match(/^(\d{1,2})[:.](\d{2})$/);
            if (!match || Number(match[1]) > 23 || Number(match[2]) > 59) {
                timeInput.placeholderText = "HH:MM";
                return;
            }
            due = Number(match[1]) * 60 + Number(match[2]);
        }
        island.addTask(value, due, priorityOrder[draftPriority]);
        taskInput.clear();
        timeInput.clear();
        draftPriority = 0;
    }

    Component.onCompleted: reload()
    onIslandChanged: reload()

    Connections {
        target: island
        function onTaskRevisionChanged() { page.reload(); }
    }

    ColumnLayout {
        anchors.fill: parent
        spacing: 8

        RowLayout {
            Layout.fillWidth: true
            Text {
                text: "Tasks"
                color: "#f3f3f5"
                font.pixelSize: 19
                font.weight: Font.DemiBold
            }
            Item { Layout.fillWidth: true }
            Text {
                text: page.agendaCount + " scheduled · " + page.doneToday + " done today"
                color: "#92939a"
                font.pixelSize: 10
            }
        }

        RowLayout {
            Layout.fillWidth: true
            spacing: 7

            QQC2.TextField {
                id: taskInput
                Layout.fillWidth: true
                height: 30
                placeholderText: "Add a task"
                color: "#f3f3f5"
                font.pixelSize: 12
                background: Rectangle {
                    radius: 10
                    color: "#111215"
                    border.color: taskInput.activeFocus ? "#ff9f43" : "#22242a"
                }
                onAccepted: page.addTask()
            }

            QQC2.TextField {
                id: timeInput
                Layout.preferredWidth: 62
                height: 30
                placeholderText: "HH:MM"
                color: "#f3f3f5"
                font.pixelSize: 11
                horizontalAlignment: TextInput.AlignHCenter
                inputMethodHints: Qt.ImhDigitsOnly
                background: Rectangle {
                    radius: 10
                    color: "#111215"
                    border.color: timeInput.activeFocus ? "#ff9f43" : "#22242a"
                }
                onAccepted: page.addTask()
            }

            QQC2.Button {
                id: priorityButton
                Layout.preferredWidth: 52
                Layout.preferredHeight: 30
                text: page.priorityLabels[page.draftPriority]
                font.pixelSize: 10
                Accessible.name: "Task priority, " + page.priorityLabels[page.draftPriority]
                background: Rectangle {
                    radius: 10
                    color: "#1a1c21"
                    border.width: priorityButton.activeFocus ? 2 : 0
                    border.color: "#f3f3f5"
                }
                contentItem: Text {
                    text: priorityButton.text
                    color: page.draftPriority === 1 ? "#ff8f8f"
                        : page.draftPriority === 2 ? "#ffd479"
                            : page.draftPriority === 3 ? "#8fd6ff" : "#c6c9d1"
                    font: priorityButton.font
                    horizontalAlignment: Text.AlignHCenter
                    verticalAlignment: Text.AlignVCenter
                }
                onClicked: page.draftPriority = (page.draftPriority + 1) % page.priorityOrder.length
            }

            Island.PillButton {
                id: addButton
                text: "Add"
                iconName: "list-add"
                enabled: taskInput.text.trim().length > 0
                onClicked: page.addTask()
            }
        }

        ListView {
            id: taskList
            Layout.fillWidth: true
            Layout.fillHeight: true
            clip: true
            spacing: 5
            model: page.tasks
            QQC2.ScrollBar.vertical: QQC2.ScrollBar { }

            delegate: Rectangle {
                required property int index
                required property var modelData
                width: taskList.width
                height: 30
                radius: 9
                color: modelData.done ? "#0a2419" : "#121317"

                RowLayout {
                    anchors.fill: parent
                    anchors.leftMargin: 9
                    anchors.rightMargin: 4
                    spacing: 7

                    QQC2.CheckBox {
                        id: taskCheck
                        Layout.preferredWidth: 17
                        Layout.preferredHeight: 17
                        implicitWidth: 17
                        implicitHeight: 17
                        leftPadding: 0
                        rightPadding: 0
                        topPadding: 0
                        bottomPadding: 0
                        contentItem: Item { }
                        checked: modelData.done
                        Accessible.name: (checked ? "Mark incomplete: " : "Mark complete: ") + modelData.text
                        indicator: Rectangle {
                            x: (taskCheck.width - width) / 2
                            y: (taskCheck.height - height) / 2
                            width: 17
                            height: 17
                            radius: 8.5
                            color: taskCheck.checked ? "#35cc8a" : "#25272d"
                            border.width: taskCheck.activeFocus ? 2 : 1
                            border.color: taskCheck.activeFocus ? "#f3f3f5" : taskCheck.checked ? "#35cc8a" : "#565861"
                            Text {
                                anchors.centerIn: parent
                                text: taskCheck.checked ? "✓" : ""
                                color: "#092118"
                                font.pixelSize: 12
                                font.weight: Font.Bold
                            }
                        }
                        background: Item { }
                        onToggled: island.setTaskDone(index, checked)
                    }

                    Text {
                        Layout.fillWidth: true
                        text: modelData.text
                        color: modelData.done ? "#a1a5a5" : "#e8e8eb"
                        font.pixelSize: 12
                        font.strikeout: modelData.done
                        elide: Text.ElideRight
                    }

                    Text {
                        visible: modelData.due !== null && !modelData.done
                        text: (modelData.dueDate < page.todayKey() ? "Late " : "")
                            + page.formatClock(modelData.due)
                        color: modelData.dueDate < page.todayKey() ? "#ffb86b" : "#b9bcc4"
                        font.pixelSize: 10
                    }

                    Text {
                        visible: modelData.priority !== null && !modelData.done
                        text: island.taskPriorityLabels[modelData.priority] || ""
                        color: modelData.priority === "high" ? "#ff8f8f"
                            : modelData.priority === "medium" ? "#ffd479" : "#8fd6ff"
                        font.pixelSize: 10
                        font.weight: Font.DemiBold
                    }

                    QQC2.ToolButton {
                        Layout.preferredWidth: 27
                        Layout.preferredHeight: 27
                        icon.name: "edit-delete"
                        icon.color: "#9da0a7"
                        onClicked: island.deleteTask(index)
                        Accessible.name: "Delete task"
                    }
                }
            }

            Text {
                anchors.centerIn: parent
                visible: page.tasks.length === 0
                text: "Your task list is clear."
                color: "#92939a"
                font.pixelSize: 12
            }
        }
    }
}
