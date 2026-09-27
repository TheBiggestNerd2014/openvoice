cmake_minimum_required(VERSION 3.15)
project(openvoice_audio)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_POSITION_INDEPENDENT_CODE ON)

add_definitions(-DNAPI_VERSION=8)

include_directories(${CMAKE_JS_INC})

set(NODE_ADDON_API_DIR "")
if(DEFINED NODE_ADDON_API)
  set(NODE_ADDON_API_DIR ${NODE_ADDON_API})
else()
  execute_process(
    COMMAND node -p "require('node-addon-api').include"
    WORKING_DIRECTORY ${CMAKE_SOURCE_DIR}/../..
    OUTPUT_VARIABLE NODE_ADDON_API_DIR
    OUTPUT_STRIP_TRAILING_WHITESPACE
  )
  string(REPLACE "\"" "" NODE_ADDON_API_DIR "${NODE_ADDON_API_DIR}")
  string(REPLACE "\n" "" NODE_ADDON_API_DIR "${NODE_ADDON_API_DIR}")
  string(REPLACE "\r" "" NODE_ADDON_API_DIR "${NODE_ADDON_API_DIR}")
endif()

include_directories(${NODE_ADDON_API_DIR})
include_directories(${CMAKE_SOURCE_DIR})

add_library(${PROJECT_NAME} SHARED
  addon.cpp
  engine.cpp
  dsp.cpp
  hotkeys.cpp
  miniaudio_impl.c
  ${CMAKE_JS_SRC}
)

set_target_properties(${PROJECT_NAME} PROPERTIES
  PREFIX ""
  SUFFIX ".node"
)

target_compile_definitions(${PROJECT_NAME} PRIVATE
  MA_NO_ENCODING
  MA_NO_GENERATION
  MA_NO_FLAC
  MA_ENABLE_WASAPI
  MA_NO_DSOUND
  MA_NO_WINMM
)

if(MSVC)
  target_compile_options(${PROJECT_NAME} PRIVATE
    $<$<COMPILE_LANGUAGE:CXX>:/utf-8 /W3 /EHsc>
    $<$<COMPILE_LANGUAGE:C>:/utf-8 /W3>
  )
  target_link_libraries(${PROJECT_NAME} PRIVATE ${CMAKE_JS_LIB} ole32 uuid user32)
else()
  target_link_libraries(${PROJECT_NAME} PRIVATE ${CMAKE_JS_LIB})
endif()

if(MSVC AND CMAKE_JS_NODELIB_DEF AND CMAKE_JS_NODELIB_TARGET)
  execute_process(
    COMMAND ${CMAKE_AR} /def:${CMAKE_JS_NODELIB_DEF} /out:${CMAKE_JS_NODELIB_TARGET} ${CMAKE_STATIC_LINKER_FLAGS}
  )
endif()
