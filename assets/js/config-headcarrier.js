/**
 * DataTables Basic
 */

'use strict';

//import { render } from "ejs";

let fv, offCanvasEl;

// datatable (jquery)
$(async function () {
  var dt_row_grouping_table = $('.dt-row-grouping')
  // Row Grouping
  // --------------------------------------------------------------------

const response = await fetch('/users/config/headcarrier/list', {
  method: 'POST'
 });
const data = await response.json();

  var groupColumn = 2;
  if (dt_row_grouping_table.length) {
    var groupingTable = dt_row_grouping_table.DataTable({
      data: data.data,
      columns: [
        { data: '' },
        { data: 'display_name' },
        { data: 'name' },
        { data: 'type_display' },
        { data: 'created_on' },
        { data: 'date_last_modified' },
        { data: '' }
      ],
      columnDefs: [
        {
          // For Responsive
          className: 'control',
          orderable: false,
          targets: 0,
          searchable: false,
          render: function (data, type, full, meta) {
            return '';
          }
        },
        { visible: false, targets: groupColumn },
        {
          // Actions
          targets: -1,
          title: 'Actions',
          orderable: false,
          searchable: false,
          render: function (data, type, full, meta) {
            return (
              `<a href="javascript:;" class="btn btn-sm btn-icon item-edit" data-bs-target="#addCarrier" data-bs-toggle="modal"
              data-bs-dismiss="modal"><i class="text-primary ti ti-plus"></i></a>` +
              `<a href="javascript:;" class="btn btn-sm btn-icon item-edit" data-bs-target="#deleteCarrier" data-bs-toggle="modal"
              data-bs-dismiss="modal"><i class="text-primary ti ti-trash"></i></a>`
            );
          }
        }
      ],
      order: [[groupColumn, 'asc']],
      dom: '<"row"<"col-sm-12 col-md-6"l><"col-sm-12 col-md-6 d-flex justify-content-center justify-content-md-end"f>>t<"row"<"col-sm-12 col-md-6"i><"col-sm-12 col-md-6"p>>',
      displayLength: 25,
      lengthMenu: [7, 10, 25, 50, 75, 100],
      drawCallback: function (settings) {
        var api = this.api();
        var rows = api.rows({ page: 'current' }).nodes();
        var last = null;

        api
          .column(groupColumn, { page: 'current' })
          .data()
          .each(function (group, i) {
            if (last !== group) {
              $(rows)
                .eq(i)
                .before('<tr class="group"><td colspan="8" class = "text-primary">' + group + '</td></tr>');
              last = group;
            }
          });
      },
      responsive: {
        details: {
          display: $.fn.dataTable.Responsive.display.modal({
            header: function (row) {
              var data = row.data();
              return 'Details of ' + data['display_name'];
            }
          }),
          type: 'column',
          renderer: function (api, rowIdx, columns) {
            var data = $.map(columns, function (col, i) {
              return col.title !== '' // ? Do not show row in modal popup if title is blank (for check box)
                ? '<tr data-dt-row="' +
                    col.rowIndex +
                    '" data-dt-column="' +
                    col.columnIndex +
                    '">' +
                    '<td>' +
                    col.title +
                    ':' +
                    '</td> ' +
                    '<td>' +
                    col.data +
                    '</td>' +
                    '</tr>'
                : '';
            }).join('');

            return data ? $('<table class="table"/><tbody />').append(data) : false;
          }
        }
      }
    });

    groupingTable.on('click', 'tr', function () {
      if( groupingTable.row(this).data()){
        document.getElementById('name1').value = groupingTable.row(this).data().name;
        document.getElementById('name2').value = groupingTable.row(this).data().name;
        document.getElementById('contact_id').value = groupingTable.row(this).data().entity_id;
        document.getElementById('carrierMga').value = groupingTable.row(this).data().display_name;
      }
    })

  }

  // Filter form control to default size
  // ? setTimeout used for multilingual table initialization
  setTimeout(() => {
    $('.dataTables_filter .form-control').removeClass('form-control-sm');
    $('.dataTables_length .form-select').removeClass('form-select-sm');
  }, 300);
});
